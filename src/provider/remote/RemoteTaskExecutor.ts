import {abortAble} from 'lineupengine';
import {Column, ICategoricalLikeColumn, IDataRow, IDateColumn, IndicesArray, INumberColumn, IOrderedGroup, isCategoricalLikeColumn, isDateColumn, isNumberColumn, Ranking} from '../../model';
import {NUM_OF_EXAMPLE_ROWS} from '../../constants';
import {ISequence, IDateStatistics, ICategoricalStatistics, IAdvancedBoxPlotData, IStatistics, dummyDateStatistics, dummyStatistics, dummyBoxPlot, dummyCategoricalStatisticsBuilder} from '../../internal';
import {IRenderTask, IRenderTasks} from '../../renderer';
import {ABORTED} from '../interfaces';
import {taskLater, TaskLater, taskNow, TaskNow, abortedTask} from '../tasks';
import {IRawNormalizedAdvancedBoxPlotData, IRawNormalizedStatistics, IServerData, toRankingDump, ERemoteStatiticsType, IComputeColumn} from './interfaces';
import {CustomAbortSignal, MultiAbortSignal, CallDebouncer} from './internal';

/**
 * @internal
 */
export interface IProviderAdapter {
  viewRows(indices: IndicesArray): Promise<IDataRow[]>;
  toDescRef(desc: any): any;
  precomputeBoxPlotStats: boolean | 'data' | 'summary' | 'group';
}


function dummyRawNormalizedStatistics(): IRawNormalizedStatistics {
  return {
    raw: dummyStatistics(),
    normalized: dummyStatistics()
  };
}

function dummyRawNormalizedAdvancedBoxPlotData(): IRawNormalizedAdvancedBoxPlotData {
  return {
    raw: dummyBoxPlot(),
    normalized: dummyBoxPlot()
  };
}


function fixNullNaN<T>(stats: T) {
  const keys = Object.keys(stats);
  const s: any = stats;
  for (const key of keys) {
    if (s[key] == null) {
      s[key] = NaN;
    }
  }
  return stats;
}

function fixDateInstance(stats: IDateStatistics, column: IDateColumn): IDateStatistics {
  const parser = column.getParser();
  function parse(v: Date | null | string) {
    if (v && !(v instanceof Date)) {
      return parser(v);
    }
    return v;
  }
  const a: any = stats;
  a.min = parse(a.min);
  a.max = parse(a.max);
  for (const bin of a.hist) {
    bin.x0 = parse(bin.x0);
    bin.x1 = parse(bin.x1);
  }
  return stats;
}

function isComputeAble(col: Column) {
  return isCategoricalLikeColumn(col) || isNumberColumn(col) || isDateColumn(col);
}

function toComputeAbleType(col: Column): ERemoteStatiticsType {
  if (isCategoricalLikeColumn(col)) {
    return ERemoteStatiticsType.categorical;
  }
  if (isNumberColumn(col)) {
    return ERemoteStatiticsType.number;
  }
  if (isDateColumn(col)) {
    return ERemoteStatiticsType.date;
  }
  throw new Error('invalid argument');
}

function suffix(col: IComputeColumn | ERemoteStatiticsType) {
  return (col === ERemoteStatiticsType.boxplot || ((<IComputeColumn>col).type && (<IComputeColumn>col).type === ERemoteStatiticsType.boxplot)) ? 'bm' : 'm';
}

/**
 * @internal
 */
export default class RemoteTaskExecutor implements IRenderTasks {
  private readonly cache = new Map<string, IRenderTask<any>>();
  private readonly cacheLoading = new Map<string, {promise: Promise<any>, signal: {abort(): void}}>();

  private readonly debouncer = new CallDebouncer();


  constructor(private readonly server: IServerData, private readonly adapter: IProviderAdapter) {

  }

  private isDummyRanking(ranking: Ranking) {
    // from a stats point of view no difference
    return ranking.getOrderLength() === this.server.totalNumberOfRows;
  }

  private cleanCaches(deleteKey: (key: string) => boolean) {
    for (const key of Array.from(this.cache.keys()).sort()) {
      // data = all
      // summary = summary + group
      // group = group only
      if (!deleteKey(key)) {
        continue;
      }
      const value = this.cache.get(key);
      this.cache.delete(key);
      if (value instanceof TaskLater) {
        value.v.abort();
      }
    }
    for (const key of Array.from(this.cacheLoading.keys()).sort()) {
      if (!deleteKey(key)) {
        continue;
      }
      const value = this.cacheLoading.get(key);
      this.cacheLoading.delete(key);
      if (value) {
        value.signal.abort();
      }
    }
  }

  // private isDummyGroup(ranking: Ranking) {
  //   return ranking.getGroups().length === 1;
  // }

  dirtyColumn(col: Column, type: 'data' | 'group' | 'summary') {
    // order designed such that first groups, then summaries, then data is deleted

    const deleteKey = (key: string) => (type === 'data' && key.startsWith(`${col.id}:`) ||
        (type === 'summary' && key.startsWith(`${col.id}:b:summary:`)) ||
        (key.startsWith(`${col.id}:a:group`)));

    this.cleanCaches(deleteKey);
  }

  dirtyRanking(ranking: Ranking, type: 'data' | 'group' | 'summary') {
    const cols = ranking.flatColumns;

    let checker: ((key: string) => boolean)[];
    switch (type) {
      case 'group':
        checker = cols.map((col) => (key: string) => key.startsWith(`${col.id}:a:group`));
        break;
      case 'summary':
        checker = cols.map((col) => (key: string) => key.startsWith(`${col.id}:b:summary`) || key.startsWith(`${col.id}:a:group`));
        break;
      case 'data':
      default:
        checker = cols.map((col) => (key: string) => key.startsWith(`${col.id}:`));
        break;
    }
    this.cleanCaches((key) => checker.some((c) => c(key)));
  }

  private preComputeBoxPlot(level: 'data' | 'ranking' | 'group') {
    if (!this.adapter.precomputeBoxPlotStats) {
      return false;
    }
    return (level === 'data' || (level === 'ranking' && this.adapter.precomputeBoxPlotStats !== 'data') || (level === this.adapter.precomputeBoxPlotStats));
  }

  preCompute(ranking: Ranking, groups: IOrderedGroup[]) {
    const columns = ranking.flatColumns.filter(isComputeAble);
    const dump = toRankingDump(ranking, this.adapter.toDescRef);
    const computeAble = columns.map((d) => ({dump: d.dump(this.adapter.toDescRef), type: toComputeAbleType(d)}));
    const computeAbleBoxPlot = computeAble.filter((d) => d.type === ERemoteStatiticsType.number).map((d) => Object.assign({}, d, { type: ERemoteStatiticsType.boxplot}));


    // load server data caches
    this.preComputeDataImpl(computeAble, computeAbleBoxPlot);

    const total = groups.reduce((a, b) => a + b.order.length, 0);
    if (groups.length === 0 || total === 0) {
      return;
    }

    // load server summary caches
    {
      const toLoadSummary = computeAble.filter((col) => !this.cache.has(`${col.dump.id}:b:summary:${suffix(col)}`));
      if (this.preComputeBoxPlot('ranking')) {
        const toLoadBoxPlotSummary = computeAbleBoxPlot.filter((col) => !this.cache.has(`${col.dump.id}:b:summary:${suffix(col)}`));
        toLoadSummary.push(...toLoadBoxPlotSummary);
      }

      if (toLoadSummary.length > 0) {
        if (total === this.server.totalNumberOfRows) {
          toLoadSummary.forEach((col) => {
            // copy from data to summary and create proper structure
            const entry = this.cacheLoading.get(`${col.dump.id}:c:data:${suffix(col)}`)!;
            this.cacheLoading.set(`${col.dump.id}:b:summary:${suffix(col)}`, {
              promise: entry.promise.then((data: any) => ({data, summary: data})),
              signal: entry.signal
            });
          });
        } else {
          const signal = new MultiAbortSignal(toLoadSummary);
          const data = this.server.computeRankingStats(dump, toLoadSummary, {signal});
          toLoadSummary.forEach((col, i) => {
            this.cacheLoading.set(`${col.dump.id}:b:summary:${suffix(col)}`, {
              promise: Promise.all([this.cacheLoading.get(`${col.dump.id}:c:data:${suffix(col)}`)!.promise, data]).then(([data, rows]) => ({data, summary: rows[i]})),
              signal
            });
          });
        }
      }
    }

    // load server group caches
    if (groups.length === 1) { // dummy group
      const group = groups[0];
      for (const col of computeAble) {
        // copy from summary to group and create proper structure
        const entry = this.cacheLoading.get(`${col.dump.id}:b:summary:m`)!;
        this.cacheLoading.set(`${col.dump.id}:a:group:${group.name}:m`, {
          promise: entry.promise.then((v: {summary: any, data: any}) => ({group: v.summary, summary: v.summary, data: v.data})),
          signal: entry.signal
        });
      }
      if (this.preComputeBoxPlot('group')) {
        for (const col of computeAbleBoxPlot) {
          // copy from summary to group and create proper structure
          const entry = this.cacheLoading.get(`${col.dump.id}:b:summary:bm`)!;
          this.cacheLoading.set(`${col.dump.id}:a:group:${group.name}:bm`, {
            promise: entry.promise.then((v: {summary: any, data: any}) => ({group: v.summary, summary: v.summary, data: v.data})),
            signal: entry.signal
          });
        }
      }
    } else {
      for (const g of groups) {
        const toLoadGroup = computeAble.filter((col) => !this.cache.has(`${col.dump.id}:a:group:${g.name}:m`));

        if (this.preComputeBoxPlot('group')) {
          const toLoadBoxPlotGroup = computeAbleBoxPlot.filter((col) => !this.cache.has(`${col.dump.id}:a:group:${g.name}:bm`));
          toLoadGroup.push(...toLoadBoxPlotGroup);
        }
        if (toLoadGroup.length === 0) {
          continue;
        }

        const signal = new MultiAbortSignal(toLoadGroup);
        const data = this.server.computeGroupStats(dump, g.name, toLoadGroup, {signal});
        toLoadGroup.forEach((col, i) => {
          this.cacheLoading.set(`${col.dump.id}:a:group:${g.name}:${suffix(col)}`, {
            promise: Promise.all([this.cacheLoading.get(`${col.dump.id}:b:summary:${suffix(col)}`)!.promise, data]).then(([summary, rows]) => ({...summary, group: rows[i]})),
            signal
          });
        });
      }
    }

    // create derived entries from the loaded server data
    for (const col of columns) {
      this.preComputeColGiven(col, ranking, groups, total);
    }
  }

  preComputeData(ranking: Ranking) {
    const columns = ranking.flatColumns.filter(isComputeAble);
    const computeAble = columns.map((d) => ({dump: d.dump(this.adapter.toDescRef), type: toComputeAbleType(d)}));
    const computeAbleBoxPlot = computeAble.filter((d) => d.type === ERemoteStatiticsType.number).map((d) => Object.assign({}, d, {type: ERemoteStatiticsType.boxplot}));

    return this.preComputeDataImpl(computeAble, computeAbleBoxPlot);
  }

  private preComputeDataImpl(computeAble: IComputeColumn[], computeAbleBoxPlot: IComputeColumn[]) {
    const toLoadData = computeAble.filter((col) => !this.cache.has(`${col.dump.id}:c:data:m`));

    if (this.preComputeBoxPlot('data')) {
      const toLoadBoxPlotData = computeAbleBoxPlot.filter((col) => !this.cache.has(`${col.dump.id}:c:data:bm`));
      toLoadData.push(...toLoadBoxPlotData);
    }

    if (toLoadData.length <= 0) {
      return;
    }
    const signal = new MultiAbortSignal(toLoadData);
    const data = this.server.computeDataStats(toLoadData, {signal});
    toLoadData.forEach((col, i) => {
      this.cacheLoading.set(`${col.dump.id}:c:data:${suffix(col)}`, {
        promise: data.then((rows) => rows[i]),
        signal
      });
    });
  }

  preComputeCol(col: Column) {
    const ranking = col.findMyRanker();
    const groups = ranking ? ranking.getGroups() : [];
    return this.preComputeColGiven(col, ranking, groups, groups.reduce((a, b) => a + b.order.length, 0));
  }

  private preComputeColGiven(col: Column, ranking: Ranking | null, groups: IOrderedGroup[], total: number) {
    if (isCategoricalLikeColumn(col)) {
      this.dataCategoricalStats(col);
      if (!ranking || total === 0) {
        return;
      }
      this.summaryCategoricalStats(col);
      for (const group of groups!) {
        this.groupCategoricalStats(col, group);
      }
      return;
    }

    if (isDateColumn(col)) {
      this.dataDateStats(col);

      if (!ranking || total === 0) {
        return;
      }
      this.summaryDateStats(col);
      for (const group of groups!) {
        this.groupDateStats(col, group);
      }
    }

    if (!isNumberColumn(col)) {
      return;
    }
    this.dataNumberStats(col, false);
    this.dataNumberStats(col, true);
    if (this.preComputeBoxPlot('data')) {
      this.dataBoxPlotStats(col, false);
      this.dataBoxPlotStats(col, true);
    }

    if (!ranking || total === 0) {
      return;
    }
    this.summaryNumberStats(col, false);
    this.summaryNumberStats(col, true);
    if (this.preComputeBoxPlot('ranking')) {
      this.summaryBoxPlotStats(col, false);
      this.summaryBoxPlotStats(col, true);
    }

    for (const group of groups!) {
      this.groupNumberStats(col, group, false);
      this.groupNumberStats(col, group, true);
      if (this.preComputeBoxPlot('group')) {
        this.groupBoxPlotStats(col, group, false);
        this.groupBoxPlotStats(col, group, true);
      }
    }
  }

  copyData2Summary(ranking: Ranking) {
    for (const col of ranking.flatColumns) {
      if (isCategoricalLikeColumn(col)) {
        this.dataCategoricalStats(col);
      } else if (isNumberColumn(col)) {
        this.dataNumberStats(col, false);
        this.dataNumberStats(col, true);
        if (this.preComputeBoxPlot('data')) {
          this.dataBoxPlotStats(col, false);
          this.dataBoxPlotStats(col, true);
        }
      } else if (isDateColumn(col)) {
        this.dataDateStats(col);
      } else {
        continue;
      }
      this.copyData2SummaryCol(col);
    }
  }

  private copyData2SummaryCol(col: Column) {
      // copy from data to summary and create proper structure
    this.chainCopy(`${col.id}:b:summary`, this.cache.get(`${col.id}:c:data`)!, (data: any) => ({summary: data, data}), true);
    if (!isNumberColumn(col)) {
      return;
    }
    this.chainCopy(`${col.id}:b:summary:raw`, this.cache.get(`${col.id}:c:data:raw`)!, (data: any) => ({summary: data, data}), true);
    if (this.cache.has(`${col.id}:c:data:b`)) {
      this.chainCopy(`${col.id}:b:summary:b`, this.cache.get(`${col.id}:c:data:b`)!, (data: any) => ({summary: data, data}), true);
    }
    if (this.cache.has(`${col.id}:c:data:braw`)) {
      this.chainCopy(`${col.id}:b:summary:braw`, this.cache.get(`${col.id}:c:data:braw`)!, (data: any) => ({summary: data, data}), true);
    }
  }

  copyCache(col: Column, from: Column) {
    const fromPrefix = `${from.id}:`;

    for (const key of Array.from(this.cache.keys()).sort()) {
      if (!key.startsWith(fromPrefix)) {
        continue;
      }
      const tkey = `${col.id}:${key.slice(fromPrefix.length)}`;
      this.chainCopy(tkey, this.cache.get(key)!, (data: any) => data);
    }
  }

  groupRows<T>(col: Column, group: IOrderedGroup, key: string, compute: (rows: ISequence<IDataRow>) => T) {
    return this.cached(`${col.id}:a:group:${group.name}:${key}`, () => this.rows(group.order, compute));
  }

  groupExampleRows<T>(_col: Column, group: IOrderedGroup, _key: string, compute: (rows: ISequence<IDataRow>) => T) {
    return taskLater(abortAble(this.rows(group.order.slice(0, NUM_OF_EXAMPLE_ROWS), compute)));
  }

  groupBoxPlotStats(col: Column & INumberColumn, group: IOrderedGroup, raw?: boolean) {
    return this.cached(`${col.id}:a:group:${group.name}${raw ? ':braw' : ':b'}`, () => this.groupStats<IRawNormalizedAdvancedBoxPlotData>(col, group, dummyRawNormalizedAdvancedBoxPlotData, ERemoteStatiticsType.boxplot).then((r) => ({
      data: raw ? r.data.raw : r.data.normalized,
      summary: raw ? r.summary.raw : r.summary.normalized,
      group: fixNullNaN(raw ? r.group.raw : r.group.normalized)
    })));
  }

  groupNumberStats(col: Column & INumberColumn, group: IOrderedGroup, raw?: boolean) {
    return this.cached(`${col.id}:a:group:${group.name}${raw ? ':raw' : ''}`, () => this.groupStats<IRawNormalizedStatistics>(col, group, dummyRawNormalizedStatistics).then((r) => ({
      data: raw ? r.data.raw : r.data.normalized,
      summary: raw ? r.summary.raw : r.summary.normalized,
      group: fixNullNaN(raw ? r.group.raw : r.group.normalized)
    })));
  }

  groupCategoricalStats(col: Column & ICategoricalLikeColumn, group: IOrderedGroup) {
    return this.cached(`${col.id}:a:group:${group.name}`, () => this.groupStats<ICategoricalStatistics>(col, group, dummyCategoricalStatisticsBuilder(col.categories)));
  }

  groupDateStats(col: Column & IDateColumn, group: IOrderedGroup) {
    return this.cached(`${col.id}:a:group:${group.name}`, () => this.groupStats<IDateStatistics>(col, group, dummyDateStatistics).then((d) => ({data: fixDateInstance(d.data, col), summary: fixDateInstance(d.summary, col), group: fixDateInstance(d.group, col)})));
  }

  summaryBoxPlotStats(col: Column & INumberColumn, raw?: boolean) {
    if (col.findMyRanker()!.getOrderLength() === 0) {
      return abortedTask<{data: IAdvancedBoxPlotData, summary: IAdvancedBoxPlotData}>();
    }
    return this.cached(`${col.id}:b:summary${raw ? ':braw' : ':b'}`, () => this.summaryStats<IRawNormalizedAdvancedBoxPlotData>(col, dummyRawNormalizedAdvancedBoxPlotData, ERemoteStatiticsType.boxplot).then((r) => ({
      data: raw ? r.data.raw : r.data.normalized,
      summary: fixNullNaN(raw ? r.summary.raw : r.summary.normalized)
    })));
  }

  summaryNumberStats(col: Column & INumberColumn, raw?: boolean) {
    if (col.findMyRanker()!.getOrderLength() === 0) {
      return abortedTask<{data: IStatistics, summary: IStatistics}>();
    }
    return this.cached(`${col.id}:b:summary${raw ? ':raw' : ''}`, () => this.summaryStats<IRawNormalizedStatistics>(col, dummyRawNormalizedStatistics).then((r) => ({
      data: raw ? r.data.raw : r.data.normalized,
      summary: fixNullNaN(raw ? r.summary.raw : r.summary.normalized)
    })));
  }

  summaryCategoricalStats(col: Column & ICategoricalLikeColumn) {
    if (col.findMyRanker()!.getOrderLength() === 0) {
      return abortedTask<{data: ICategoricalStatistics, summary: ICategoricalStatistics}>();
    }
    return this.cached(`${col.id}:b:summary`, () => this.summaryStats<ICategoricalStatistics>(col, dummyCategoricalStatisticsBuilder(col.categories)));
  }

  summaryDateStats(col: Column & IDateColumn) {
    if (col.findMyRanker()!.getOrderLength() === 0) {
      return abortedTask<{data: IDateStatistics, summary: IDateStatistics}>();
    }
    return this.cached(`${col.id}:b:summary`, () => this.summaryStats<IDateStatistics>(col, dummyDateStatistics).then((d) => ({data: fixDateInstance(d.data, col), summary: fixDateInstance(d.summary, col)})));
  }


  private isValidCacheEntry(key: string) {
    if (!this.cache.has(key)) {
      return false;
    }
    const v = this.cache.get(key);

    // not an aborted task
    if (v instanceof TaskNow) {
      return typeof v.v !== 'symbol';
    }
    if (v instanceof TaskLater) {
      return typeof v.v !== 'symbol' && !v.v.isAborted();
    }
    return true;
  }

  private chainCopy<T, U>(key: string, task: IRenderTask<T>, creator: (data: T) => U, force = false): IRenderTask<U> {
    if (this.isValidCacheEntry(key) && !force) {
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

    const v = (<TaskLater<T>>task).v;
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

  dataBoxPlotStats(col: Column & INumberColumn, raw?: boolean): IRenderTask<IAdvancedBoxPlotData> {
    return this.cached(`${col.id}:c:data${raw ? ':braw' : ':b'}`, () => this.dataStats<IRawNormalizedAdvancedBoxPlotData>(col, ERemoteStatiticsType.boxplot).then((r) => fixNullNaN(raw ? r.raw : r.normalized)));
  }

  dataNumberStats(col: Column & INumberColumn, raw?: boolean): IRenderTask<IStatistics> {
    return this.cached(`${col.id}:c:data${raw ? ':raw' : ''}`, () => this.dataStats<IRawNormalizedStatistics>(col).then((r) => fixNullNaN(raw ? r.raw : r.normalized)));
  }

  dataCategoricalStats(col: Column & ICategoricalLikeColumn) {
    return this.cached(`${col.id}:c:data`, () => this.dataStats<ICategoricalStatistics>(col));
  }

  dataDateStats(col: Column & IDateColumn) {
    return this.cached(`${col.id}:c:data`, () => this.dataStats<IDateStatistics>(col).then((s) => fixDateInstance(s, col)));
  }

  private cached<T>(key: string, creator: () => Promise<T>): IRenderTask<T> {
    if (this.isValidCacheEntry(key)) {
      return this.cache.get(key)!;
    }

    const task = abortAble(creator());
    const s = taskLater(task);
    this.cache.set(key, s);
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


  private dataStats<T>(col: Column, type = toComputeAbleType(col)): Promise<T> {
    const key = `${col.id}:c:data:${suffix(type)}`;
    if (this.cacheLoading.has(key)) {
      return this.cacheLoading.get(key)!.promise;
    }
    const {data, signal} = this.debouncer.debouncedCall('', col.dump(this.adapter.toDescRef), type, (cols, signal) => this.server.computeDataStats(cols, {signal}));
    this.cacheLoading.set(key, {promise: data, signal});
    return <any>data;
  }

  private summaryStats<T>(col: Column, dummyFactory: () => T, type = toComputeAbleType(col)): Promise<{data: T, summary: T}> {
    const key = `${col.id}:b:summary:${suffix(type)}`;
    if (this.cacheLoading.has(key)) {
      return this.cacheLoading.get(key)!.promise;
    }
    const data = this.dataStats<T>(col, type);
    const ranking = col.findMyRanker()!;

    if (ranking.getOrderLength() === 0) {
      return data.then((data) => ({data, summary: dummyFactory()}));
      // this.cache.set(key, v); // don't cache dummies
      // return v;
    }

    if (this.isDummyRanking(ranking)) {
      const v = data.then((data) => ({data, summary: data}));
      this.cacheLoading.set(key, {promise: v, signal: {abort: () => undefined}});
      return v;
    }
    const rankingDump = toRankingDump(ranking, this.adapter.toDescRef);
    // TODO debounce
    const signal = new CustomAbortSignal();
    const summary = <Promise<T>><any>this.server.computeRankingStats(rankingDump, [{dump: col.dump(this.adapter.toDescRef), type}], {signal}).then((r) => r[0]);
    const v = Promise.all([data, summary]).then(([data, summary]) => ({data, summary}));
    this.cacheLoading.set(key, {promise: v, signal});
    return v;
  }

  private groupStats<T>(col: Column, g: IOrderedGroup, dummyFactory: () => T, type = toComputeAbleType(col)): Promise<{data: T, summary: T, group: T}> {
    const key = `${col.id}:a:group:${g.name}:${suffix(type)}`;
    if (this.cacheLoading.has(key)) {
      return this.cacheLoading.get(key)!.promise;
    }
    const summary = this.summaryStats<T>(col, dummyFactory, type);
    if (g.order.length === 0) {
      return summary.then((summary) => ({...summary, group: dummyFactory()}));
      // this.cache.set(key, v);
      // return v;
    }
    const ranking = toRankingDump(col.findMyRanker()!, this.adapter.toDescRef);
    // TODO debounce
    const signal = new CustomAbortSignal();
    const group = <Promise<T>><any>this.server.computeGroupStats(ranking, g.name, [{dump: col.dump(this.adapter.toDescRef), type}], {signal}).then((r) => r[0]);
    const v = Promise.all([summary, group]).then(([summary, group]) => ({...summary, group}));
    this.cacheLoading.set(key, {promise: v, signal});
    return v;
  }

  private rows<T>(indices: IndicesArray, compute: (rows: ISequence<IDataRow>) => T) {
    return this.adapter.viewRows(indices).then(compute);
  }

  terminate() {
    this.cache.clear();
  }
}
