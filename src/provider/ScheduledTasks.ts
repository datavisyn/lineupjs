import { abortAble } from 'lineupengine';
import {
  getNumberOfBins,
  IAdvancedBoxPlotData,
  ICategoricalStatistics,
  IDateStatistics,
  ISequence,
  ISortMessageResponse,
  IStatistics,
  lazySeq,
  toIndexArray,
  WorkerTaskScheduler,
  createWorkerBlob,
  IStringStatistics,
} from '../internal';
import TaskScheduler, { ABORTED, oneShotIterator } from '../internal/scheduler';
import Column, {
  ICategoricalLikeColumn,
  ICompareValue,
  IDataRow,
  IDateColumn,
  IGroup,
  IndicesArray,
  INumberColumn,
  IOrderedGroup,
  isCategoricalLikeColumn,
  isDateColumn,
  isNumberColumn,
  Ranking,
  StringColumn,
  UIntTypedArray,
} from '../model';
import type { IRenderTask } from '../renderer';
import { sortDirect } from './DirectRenderTasks';
import type { CompareLookup } from './sort';
import { ARenderTasks, IRenderTaskExecutor, MultiIndices, taskLater, TaskLater, taskNow, TaskNow } from './tasks';

export class ScheduleRenderTasks extends ARenderTasks implements IRenderTaskExecutor {
  private readonly cache = new Map<string, IRenderTask<any>>();
  private readonly tasks = new TaskScheduler();
  private readonly workers = new WorkerTaskScheduler(createWorkerBlob());

  setData(data: IDataRow[]) {
    this.data = data;
    this.cache.clear();
    this.tasks.clear();
    this.valueCacheData.clear();
    this.workers.deleteRefs();
  }

  dirtyColumn(col: Column, type: 'data' | 'group' | 'summary') {
    super.dirtyColumn(col, type);
    // order designed such that first groups, then summaries, then data is deleted

    for (const key of Array.from(this.cache.keys()).sort()) {
      // data = all
      // summary = summary + group
      // group = group only
      if (
        (type === 'data' && key.startsWith(`${col.id}:`)) ||
        (type === 'summary' && key.startsWith(`${col.id}:b:summary:`)) ||
        key.startsWith(`${col.id}:a:group`)
      ) {
        this.cache.delete(key);
        this.tasks.abort(key);
      }
    }

    if (type !== 'data') {
      return;
    }

    this.valueCacheData.delete(col.id);
    this.workers.deleteRef(col.id);
  }

  dirtyRanking(ranking: Ranking, type: 'data' | 'group' | 'summary') {
    const cols = ranking.flatColumns;

    let checker: ((key: string) => boolean)[];
    switch (type) {
      case 'group':
        checker = cols.map((col) => (key: string) => key.startsWith(`${col.id}:a:group`));
        break;
      case 'summary':
        checker = cols.map(
          (col) => (key: string) => key.startsWith(`${col.id}:b:summary`) || key.startsWith(`${col.id}:a:group`)
        );
        break;
      case 'data':
      default:
        checker = cols.map((col) => (key: string) => key.startsWith(`${col.id}:`));
        break;
    }
    for (const key of Array.from(this.cache.keys()).sort()) {
      if (checker.some((f) => f(key))) {
        this.cache.delete(key);
        this.tasks.abort(key);
      }
    }
    // group compare tasks
    this.tasks.abortAll((t) => t.id.startsWith(`r${ranking.id}:`));

    // delete remote caches
    this.workers.deleteRef(ranking.id, true);

    if (type !== 'data') {
      return;
    }

    for (const col of cols) {
      super.dirtyColumn(col, type);
      this.workers.deleteRef(col.id);
    }
  }

  preCompute(ranking: Ranking, groups: { rows: IndicesArray; group: IGroup }[], maxDataIndex: number) {
    if (groups.length === 0) {
      return;
    }
    const cols = ranking.flatColumns;
    if (groups.length === 1) {
      const { group, rows } = groups[0];
      const multi = new MultiIndices([rows], maxDataIndex);
      for (const col of cols) {
        if (isCategoricalLikeColumn(col)) {
          this.summaryCategoricalStats(col, multi);
        } else if (isNumberColumn(col)) {
          this.summaryNumberStats(col, false, multi);
          this.summaryNumberStats(col, true, multi);
        } else if (isDateColumn(col)) {
          this.summaryDateStats(col, multi);
        } else if (col instanceof StringColumn) {
          this.summaryStringStats(col, multi);
        } else {
          continue;
        }
        // copy from summary to group and create proper structure
        this.chainCopy(
          `${col.id}:a:group:${group.name}`,
          this.cache.get(`${col.id}:b:summary`)!,
          (v: { summary: any; data: any }) => ({ group: v.summary, summary: v.summary, data: v.data })
        );
        if (isNumberColumn(col)) {
          this.chainCopy(
            `${col.id}:a:group:${group.name}:raw`,
            this.cache.get(`${col.id}:b:summary:raw`)!,
            (v: { summary: any; data: any }) => ({ group: v.summary, summary: v.summary, data: v.data })
          );
        }
      }
      return;
    }

    const orderedGroups = groups.map(({ rows, group }) => Object.assign({ order: rows }, group));
    const full = new MultiIndices(
      groups.map((d) => d.rows),
      maxDataIndex
    );
    for (const col of cols) {
      if (isCategoricalLikeColumn(col)) {
        this.summaryCategoricalStats(col, full);
        for (const g of orderedGroups) {
          this.groupCategoricalStats(col, g);
        }
      } else if (isDateColumn(col)) {
        this.summaryDateStats(col, full);
        for (const g of orderedGroups) {
          this.groupDateStats(col, g);
        }
      } else if (isNumberColumn(col)) {
        this.summaryNumberStats(col, false, full);
        this.summaryNumberStats(col, true, full);
        for (const g of orderedGroups) {
          this.groupNumberStats(col, g, false);
          this.groupNumberStats(col, g, true);
        }
      } else if (col instanceof StringColumn) {
        this.summaryStringStats(col, full);
        for (const g of orderedGroups) {
          this.groupStringStats(col, g);
        }
      }
    }
  }

  preComputeData(ranking: Ranking) {
    for (const col of ranking.flatColumns) {
      if (isCategoricalLikeColumn(col)) {
        this.dataCategoricalStats(col);
      } else if (isNumberColumn(col)) {
        this.dataNumberStats(col, false);
        this.dataNumberStats(col, true);
      } else if (isDateColumn(col)) {
        this.dataDateStats(col);
      } else if (col instanceof StringColumn) {
        this.dataStringStats(col);
      }
    }
  }

  preComputeCol(col: Column) {
    const ranking = col.findMyRanker();

    if (col instanceof StringColumn) {
      this.dataStringStats(col);
      if (!ranking) {
        return;
      }
      this.summaryStringStats(col);
      for (const group of ranking.getGroups()) {
        this.groupStringStats(col, group);
      }
      return;
    }

    if (isCategoricalLikeColumn(col)) {
      this.dataCategoricalStats(col);
      if (!ranking) {
        return;
      }
      this.summaryCategoricalStats(col);
      for (const group of ranking.getGroups()) {
        this.groupCategoricalStats(col, group);
      }
      return;
    }

    if (isNumberColumn(col)) {
      this.dataNumberStats(col, false);
      this.dataNumberStats(col, true);

      if (!ranking) {
        return;
      }
      this.summaryNumberStats(col, false);
      this.summaryNumberStats(col, true);
      for (const group of ranking.getGroups()) {
        this.groupNumberStats(col, group, false);
        this.groupNumberStats(col, group, true);
      }
      return;
    }

    if (!isDateColumn(col)) {
      return;
    }

    this.dataDateStats(col);

    if (!ranking) {
      return;
    }
    this.summaryDateStats(col);
    for (const group of ranking.getGroups()) {
      this.groupDateStats(col, group);
    }
  }

  copyData2Summary(ranking: Ranking) {
    for (const col of ranking.flatColumns) {
      if (isCategoricalLikeColumn(col)) {
        this.dataCategoricalStats(col);
      } else if (isNumberColumn(col)) {
        this.dataNumberStats(col, false);
        this.dataNumberStats(col, true);
      } else if (isDateColumn(col)) {
        this.dataDateStats(col);
      } else if (col instanceof StringColumn) {
        this.dataStringStats(col);
      } else {
        continue;
      }
      // copy from data to summary and create proper structure
      this.chainCopy(`${col.id}:b:summary`, this.cache.get(`${col.id}:c:data`)!, (data: any) => ({
        summary: data,
        data,
      }));
      if (isNumberColumn(col)) {
        this.chainCopy(`${col.id}:b:summary:raw`, this.cache.get(`${col.id}:c:data:raw`)!, (data: any) => ({
          summary: data,
          data,
        }));
      }
    }
  }

  copyCache(col: Column, from: Column) {
    const fromPrefix = `${from.id}:`;

    for (const key of Array.from(this.cache.keys()).sort()) {
      if (!key.startsWith(fromPrefix)) {
        continue;
      }
      const chainKey = `${col.id}:${key.slice(fromPrefix.length)}`;
      this.chainCopy(chainKey, this.cache.get(key)!, (data: any) => data);
    }
  }

  groupCompare(ranking: Ranking, group: IGroup, rows: IndicesArray) {
    return taskLater(
      this.tasks.push(`r${ranking.id}:${group.name}`, () => {
        const rg = ranking.getGroupSortCriteria();
        if (rg.length === 0) {
          return [group.name.toLowerCase()];
        }
        const o = this.byOrder(rows);
        const vs: ICompareValue[] = [];
        for (const s of rg) {
          const cache = this.valueCache(s.col);
          const r = s.col.toCompareGroupValue(o, group, cache ? lazySeq(rows).map((d) => cache(d)) : undefined);
          if (Array.isArray(r)) {
            vs.push(...r);
          } else {
            vs.push(r);
          }
        }
        vs.push(group.name.toLowerCase());
        return vs;
      })
    );
  }

  groupRows<T>(col: Column, group: IOrderedGroup, key: string, compute: (rows: ISequence<IDataRow>) => T) {
    return this.cached(
      `${col.id}:a:group:${group.name}:${key}`,
      true,
      oneShotIterator(() => compute(this.byOrder(group.order)))
    );
  }

  groupExampleRows<T>(_col: Column, group: IOrderedGroup, _key: string, compute: (rows: ISequence<IDataRow>) => T) {
    return taskNow(compute(this.byOrder(group.order.slice(0, 5))));
  }

  groupBoxPlotStats(col: Column & INumberColumn, group: IOrderedGroup, raw?: boolean) {
    return this.chain(
      `${col.id}:a:group:${group.name}${raw ? ':braw' : ':b'}`,
      this.summaryBoxPlotStats(col, raw),
      ({ summary, data }) => {
        const ranking = col.findMyRanker()!;
        const key = raw ? `${col.id}:r` : col.id;
        if (this.valueCacheData.has(key) && group.order.length > 0) {
          // web worker version
          return () =>
            this.workers
              .pushStats(
                'boxplotStats',
                {},
                key,
                this.valueCacheData.get(key) as Float32Array,
                `${ranking.id}:${group.name}`,
                group.order
              )
              .then((group) => ({ group, summary, data }));
        }
        return this.boxplotBuilder(group.order, col, raw, (group) => ({ group, summary, data }));
      }
    );
  }

  groupNumberStats(col: Column & INumberColumn, group: IOrderedGroup, raw?: boolean) {
    return this.chain(
      `${col.id}:a:group:${group.name}${raw ? ':raw' : ''}`,
      this.summaryNumberStats(col, raw),
      ({ summary, data }) => {
        const ranking = col.findMyRanker()!;
        const key = raw ? `${col.id}:r` : col.id;
        if (this.valueCacheData.has(key) && group.order.length > 0) {
          // web worker version
          return () =>
            this.workers
              .pushStats(
                'numberStats',
                { numberOfBins: summary.hist.length, domain: this.resolveDomain(col, raw) },
                key,
                this.valueCacheData.get(key) as Float32Array,
                `${ranking.id}:${group.name}`,
                group.order
              )
              .then((group) => ({ group, summary, data }));
        }
        return this.statsBuilder(group.order, col, summary.hist.length, raw, (group) => ({
          group,
          summary,
          data,
        }));
      }
    );
  }

  groupCategoricalStats(col: Column & ICategoricalLikeColumn, group: IOrderedGroup) {
    return this.chain(`${col.id}:a:group:${group.name}`, this.summaryCategoricalStats(col), ({ summary, data }) => {
      const ranking = col.findMyRanker()!;
      if (this.valueCacheData.has(col.id) && group.order.length > 0) {
        // web worker version
        return () =>
          this.workers
            .pushStats(
              'categoricalStats',
              { categories: col.categories.map((d) => d.name) },
              col.id,
              this.valueCacheData.get(col.id) as UIntTypedArray,
              `${ranking.id}:${group.name}`,
              group.order
            )
            .then((group) => ({ group, summary, data }));
      }
      return this.categoricalStatsBuilder(group.order, col, (group) => ({ group, summary, data }));
    });
  }

  groupDateStats(col: Column & IDateColumn, group: IOrderedGroup) {
    const key = `${col.id}:a:group:${group.name}`;
    return this.chain(key, this.summaryDateStats(col), ({ summary, data }) => {
      const ranking = col.findMyRanker()!;
      if (this.valueCacheData.has(col.id) && group.order.length > 0) {
        // web worker version
        return () =>
          this.workers
            .pushStats(
              'dateStats',
              { template: summary },
              col.id,
              this.valueCacheData.get(col.id) as Float64Array,
              `${ranking.id}:${group.name}`,
              group.order
            )
            .then((group) => ({ group, summary, data }));
      }
      return this.dateStatsBuilder(group.order, col, summary, (group) => ({ group, summary, data }));
    });
  }

  groupStringStats(col: StringColumn, group: IOrderedGroup) {
    const key = `${col.id}:a:group:${group.name}`;
    return this.chain(key, this.summaryStringStats(col), ({ summary, data }) => {
      const ranking = col.findMyRanker()!;
      const topN = summary.topN.map((d) => d.value);
      if (this.valueCacheData.has(col.id) && group.order.length > 0) {
        // web worker version
        return () =>
          this.workers
            .pushStats(
              'stringStats',
              { topN: this.options.stringTopNCount },
              col.id,
              this.valueCacheData.get(col.id) as readonly string[],
              `${ranking.id}:${group.name}`,
              group.order
            )
            .then((group) => ({ group, summary, data }));
      }
      return this.stringStatsBuilder(group.order, col, topN, (group) => ({ group, summary, data }));
    });
  }

  summaryBoxPlotStats(col: Column & INumberColumn, raw?: boolean, order?: MultiIndices) {
    return this.chain(`${col.id}:b:summary${raw ? ':braw' : ':b'}`, this.dataBoxPlotStats(col, raw), (data) => {
      const ranking = col.findMyRanker()!;
      const key = raw ? `${col.id}:r` : col.id;
      if (this.valueCacheData.has(key)) {
        // web worker version
        return () =>
          this.workers
            .pushStats(
              'boxplotStats',
              {},
              key,
              this.valueCacheData.get(key) as Float32Array,
              ranking.id,
              order ? order.joined : ranking.getOrder()
            )
            .then((summary) => ({ summary, data }));
      }
      return this.boxplotBuilder(order ? order : ranking.getOrder(), col, raw, (summary) => ({ summary, data }));
    });
  }

  summaryNumberStats(col: Column & INumberColumn, raw?: boolean, order?: MultiIndices) {
    return this.chain(`${col.id}:b:summary${raw ? ':raw' : ''}`, this.dataNumberStats(col, raw), (data) => {
      const ranking = col.findMyRanker()!;
      const key = raw ? `${col.id}:r` : col.id;
      if (this.valueCacheData.has(key)) {
        // web worker version
        return () =>
          this.workers
            .pushStats(
              'numberStats',
              { numberOfBins: data.hist.length, domain: this.resolveDomain(col, raw) },
              key,
              this.valueCacheData.get(key) as Float32Array,
              ranking.id,
              order ? order.joined : ranking.getOrder()
            )
            .then((summary) => ({ summary, data }));
      }
      return this.statsBuilder(order ? order : ranking.getOrder(), col, data.hist.length, raw, (summary) => ({
        summary,
        data,
      }));
    });
  }

  summaryCategoricalStats(col: Column & ICategoricalLikeColumn, order?: MultiIndices) {
    return this.chain(`${col.id}:b:summary`, this.dataCategoricalStats(col), (data) => {
      const ranking = col.findMyRanker()!;
      if (this.valueCacheData.has(col.id)) {
        // web worker version
        return () =>
          this.workers
            .pushStats(
              'categoricalStats',
              { categories: col.categories.map((d) => d.name) },
              col.id,
              this.valueCacheData.get(col.id) as UIntTypedArray,
              ranking.id,
              order ? order.joined : ranking.getOrder()
            )
            .then((summary) => ({ summary, data }));
      }
      return this.categoricalStatsBuilder(order ? order : ranking.getOrder(), col, (summary) => ({ summary, data }));
    });
  }

  summaryDateStats(col: Column & IDateColumn, order?: MultiIndices) {
    return this.chain(`${col.id}:b:summary`, this.dataDateStats(col), (data) => {
      const ranking = col.findMyRanker()!;
      if (this.valueCacheData.has(col.id)) {
        // web worker version
        return () =>
          this.workers
            .pushStats(
              'dateStats',
              { template: data },
              col.id,
              this.valueCacheData.get(col.id) as Float64Array,
              ranking.id,
              order ? order.joined : ranking.getOrder()
            )
            .then((summary) => ({ summary, data }));
      }
      return this.dateStatsBuilder(order ? order : ranking.getOrder(), col, data, (summary) => ({ summary, data }));
    });
  }

  summaryStringStats(col: StringColumn, order?: MultiIndices) {
    return this.chain(`${col.id}:b:summary`, this.dataStringStats(col), (data) => {
      const ranking = col.findMyRanker()!;
      if (this.valueCacheData.has(col.id)) {
        // web worker version
        return () =>
          this.workers
            .pushStats(
              'stringStats',
              { topN: this.options.stringTopNCount },
              col.id,
              this.valueCacheData.get(col.id) as readonly string[],
              ranking.id,
              order ? order.joined : ranking.getOrder()
            )
            .then((summary) => ({ summary, data }));
      }
      return this.stringStatsBuilder(order ? order : ranking.getOrder(), col, undefined, (summary) => ({
        summary,
        data,
      }));
    });
  }

  private cached<T>(key: string, canAbort: boolean, it: Iterator<T | null> | (() => Promise<T>)): IRenderTask<T> {
    const dontCache = this.data.length === 0;

    if (this.isValidCacheEntry(key) && !dontCache) {
      return this.cache.get(key)!;
    }

    const task = typeof it === 'function' ? abortAble(it()) : this.tasks.pushMulti(key, it, canAbort);
    const s = taskLater(task);
    if (!dontCache) {
      this.cache.set(key, s);
    }
    task.then((r) => {
      if (this.cache.get(key) !== s) {
        return;
      }
      if (typeof r === 'symbol') {
        this.cache.delete(key);
      } else {
        this.cache.set(key, taskNow(r));
      }
    });
    return s;
  }

  private chain<T, U>(
    key: string,
    task: IRenderTask<T>,
    creator: (data: T) => Iterator<U | null> | (() => Promise<U>)
  ): IRenderTask<U> {
    if (this.isValidCacheEntry(key)) {
      return this.cache.get(key)!;
    }
    if (task instanceof TaskNow) {
      if (typeof task.v === 'symbol') {
        // aborted
        return taskNow(ABORTED);
      }
      return this.cached(key, true, creator(task.v));
    }

    const v = (task as TaskLater<T>).v;
    const subTask = v.then((data) => {
      if (typeof data === 'symbol') {
        return ABORTED;
      }
      const created = creator(data);
      if (typeof created === 'function') {
        // promise
        return created();
      }
      return this.tasks.pushMulti(key, created);
    });
    const s = taskLater(subTask);
    this.cache.set(key, s);
    subTask.then((r) => {
      if (this.cache.get(key) !== s) {
        return;
      }
      if (typeof r === 'symbol') {
        this.cache.delete(key);
      } else {
        this.cache.set(key, taskNow(r));
      }
    });
    return s;
  }

  private isValidCacheEntry(key: string) {
    if (!this.cache.has(key)) {
      return false;
    }
    const v = this.cache.get(key);
    // not an aborted task
    return !(v instanceof TaskNow && typeof v.v === 'symbol') && !(v instanceof TaskLater && v.v.isAborted());
  }

  private chainCopy<T, U>(key: string, task: IRenderTask<T>, creator: (data: T) => U): IRenderTask<U> {
    if (this.isValidCacheEntry(key)) {
      return this.cache.get(key)!;
    }
    if (task instanceof TaskNow) {
      if (typeof task.v === 'symbol') {
        // aborted
        return taskNow(ABORTED);
      }
      const subTask = taskNow(creator(task.v));
      this.cache.set(key, subTask);
      return subTask;
    }

    const v = (task as TaskLater<T>).v;
    const subTask = v.then((data) => {
      if (typeof data === 'symbol') {
        return ABORTED;
      }
      return creator(data);
    });
    const s = taskLater(subTask);
    this.cache.set(key, s);
    subTask.then((r) => {
      if (this.cache.get(key) !== s) {
        return;
      }
      if (typeof r === 'symbol') {
        this.cache.delete(key);
      } else {
        this.cache.set(key, taskNow(r));
      }
    });
    return s;
  }

  dataBoxPlotStats(col: Column & INumberColumn, raw?: boolean) {
    const key = `${col.id}:c:data${raw ? ':braw' : ':b'}`;
    const valueCacheKey = raw ? `${col.id}:r` : col.id;
    if (this.valueCacheData.has(valueCacheKey) && this.data.length > 0) {
      // use webworker
      return this.cached(key, false, () =>
        this.workers.pushStats(
          'boxplotStats',
          {},
          valueCacheKey,
          this.valueCacheData.get(valueCacheKey)! as Float32Array
        )
      );
    }
    return this.cached(key, false, this.boxplotBuilder<IAdvancedBoxPlotData>(null, col, raw));
  }

  dataNumberStats(col: Column & INumberColumn, raw?: boolean) {
    return this.cached(
      `${col.id}:c:data${raw ? ':raw' : ''}`,
      false,
      this.statsBuilder<IStatistics>(null, col, getNumberOfBins(this.data.length), raw)
    );
  }

  dataCategoricalStats(col: Column & ICategoricalLikeColumn) {
    return this.cached(`${col.id}:c:data`, false, this.categoricalStatsBuilder<ICategoricalStatistics>(null, col));
  }

  dataStringStats(col: StringColumn) {
    return this.cached(`${col.id}:c:data`, false, this.stringStatsBuilder<IStringStatistics>(null, col));
  }

  dataDateStats(col: Column & IDateColumn) {
    return this.cached(`${col.id}:c:data`, false, this.dateStatsBuilder<IDateStatistics>(null, col));
  }

  sort(
    ranking: Ranking,
    group: IGroup,
    indices: IndicesArray,
    singleCall: boolean,
    maxDataIndex: number,
    lookups?: CompareLookup
  ) {
    if (!lookups || indices.length < 1000) {
      // no thread needed
      const order = sortDirect(indices, maxDataIndex, lookups);
      return Promise.resolve(order);
    }

    const indexArray = toIndexArray(indices, maxDataIndex);
    const toTransfer = [indexArray.buffer];

    if (singleCall) {
      // can transfer otherwise need to copy
      toTransfer.push(...lookups.transferAbles);
    }

    return this.workers.push(
      'sort',
      {
        ref: `${ranking.id}:${group.name}`,
        indices: indexArray,
        sortOrders: lookups.sortOrders,
      },
      toTransfer,
      (r: ISortMessageResponse) => r.order
    );
  }

  terminate() {
    this.workers.terminate();
    this.cache.clear();
    this.valueCacheData.clear();
  }
}
