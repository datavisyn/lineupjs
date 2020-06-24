import Column, {IDataRow, Ranking, IndicesArray, IGroup, IOrderedGroup, INumberColumn, IDateColumn, ICategoricalLikeColumn, ICompareValue} from '../model';
import {ARenderTasks, IRenderTaskExecutor, taskNow} from './tasks';
import {ISequence, toIndexArray, sortComplex, getNumberOfBins} from '../internal';
import {CompareLookup} from './sort';
import {NUM_OF_EXAMPLE_ROWS} from '../constants';
import {IRenderTask} from '..';

/**
 * @internal
 */
export function sortDirect(indices: IndicesArray, maxDataIndex: number, lookups?: CompareLookup) {
  const order = toIndexArray(indices, maxDataIndex);
  if (lookups) {
    sortComplex(order, lookups.sortOrders);
  }
  return order;
}

/**
 * @internal
 */
export class DirectRenderTasks extends ARenderTasks implements IRenderTaskExecutor {

  protected readonly cache = new Map<string, any>();

  setData(data: IDataRow[]) {
    this.data = data;
    this.cache.clear();
    this.valueCacheData.clear();
  }


  dirtyColumn(col: Column, type: 'data' | 'summary' | 'group') {
    super.dirtyColumn(col, type);

    if (type === 'group') {
      return; // not cached
    }
    this.cache.delete(`${col.id}:summary`);
    this.cache.delete(`${col.id}:summary:raw`);
    this.cache.delete(`${col.id}:summary:b`);
    this.cache.delete(`${col.id}:summary:braw`);

    if (type === 'summary') {
      return;
    }
    this.cache.delete(`${col.id}:data`);
    this.cache.delete(`${col.id}:data:raw`);
    this.cache.delete(`${col.id}:data:b`);
    this.cache.delete(`${col.id}:data:braw`);
  }

  dirtyRanking(ranking: Ranking, type: 'data' | 'summary' | 'group') {
    for (const col of ranking.flatColumns) {
      this.dirtyColumn(col, type);
    }
  }

  preCompute() {
    // dummy
  }

  preComputeData() {
    // dummy
  }

  preComputeCol() {
    // dummy
  }

  copyData2Summary() {
    // dummy
  }

  copyCache(col: Column, from: Column) {
    const fromPrefix = `${from.id}:`;

    for (const key of Array.from(this.cache.keys()).sort()) {
      if (!key.startsWith(fromPrefix)) {
        continue;
      }
      const tkey = `${col.id}:${key.slice(fromPrefix.length)}`;
      this.cache.set(tkey, this.cache.get(key)!);
    }
  }

  sort(_ranking: Ranking, _group: IGroup, indices: IndicesArray, _singleCall: boolean, maxDataIndex: number, lookups?: CompareLookup) {
    return Promise.resolve(sortDirect(indices, maxDataIndex, lookups));
  }

  groupCompare(ranking: Ranking, group: IGroup, rows: IndicesArray): IRenderTask<ICompareValue[]> {
    const rg = ranking.getGroupSortCriteria();
    if (rg.length === 0) {
      return taskNow([group.name.toLowerCase()]);
    }
    const o = this.byOrder(rows);
    const vs: ICompareValue[] = [];
    for (const s of rg) {
      const r = s.col.toCompareGroupValue(o, group);
      if (Array.isArray(r)) {
        vs.push(...r);
      } else {
        vs.push(r);
      }
    }
    vs.push(group.name.toLowerCase());
    return taskNow(vs);
  }

  groupRows<T>(_col: Column, group: IOrderedGroup, _key: string, compute: (rows: ISequence<IDataRow>) => T): IRenderTask<T> {
    return taskNow(compute(this.byOrder(group.order)));
  }

  groupExampleRows<T>(_col: Column, group: IOrderedGroup, _key: string, compute: (rows: ISequence<IDataRow>) => T): IRenderTask<T> {
    return taskNow(compute(this.byOrder(group.order.slice(0, NUM_OF_EXAMPLE_ROWS))));
  }

  groupBoxPlotStats(col: Column & INumberColumn, group: IOrderedGroup, raw?: boolean) {
    const {summary, data} = this.summaryBoxPlotStatsD(col, raw);
    return taskNow({group: this.boxplotBuilder(group.order, col, raw).next(Infinity).value!, summary, data});
  }

  groupNumberStats(col: Column & INumberColumn, group: IOrderedGroup, raw?: boolean) {
    const {summary, data} = this.summaryNumberStatsD(col, raw);
    return taskNow({group: this.normalizedStatsBuilder(group.order, col, summary.hist.length, raw).next(Infinity).value!, summary, data});
  }

  groupCategoricalStats(col: Column & ICategoricalLikeColumn, group: IOrderedGroup) {
    const {summary, data} = this.summaryCategoricalStatsD(col);
    return taskNow({group: this.categoricalStatsBuilder(group.order, col).next(Infinity).value!, summary, data});
  }

  groupDateStats(col: Column & IDateColumn, group: IOrderedGroup) {
    const {summary, data} = this.summaryDateStatsD(col);
    return taskNow({group: this.dateStatsBuilder(group.order, col, summary).next(Infinity).value!, summary, data});
  }

  summaryBoxPlotStats(col: Column & INumberColumn, raw?: boolean) {
    return taskNow(this.summaryBoxPlotStatsD(col, raw));
  }

  summaryNumberStats(col: Column & INumberColumn, raw?: boolean) {
    return taskNow(this.summaryNumberStatsD(col, raw));
  }

  summaryCategoricalStats(col: Column & ICategoricalLikeColumn) {
    return taskNow(this.summaryCategoricalStatsD(col));
  }

  summaryDateStats(col: Column & IDateColumn) {
    return taskNow(this.summaryDateStatsD(col));
  }

  private summaryNumberStatsD(col: Column & INumberColumn, raw?: boolean) {
    return this.cached('summary', col, () => {
      const ranking = col.findMyRanker()!.getOrder();
      const data = this.dataNumberStats(col, raw);
      return {summary: this.normalizedStatsBuilder(ranking, col, data.hist.length, raw).next(Infinity).value!, data};
    }, raw ? ':raw' : '', col.findMyRanker()!.getOrderLength() === 0);
  }

  private summaryBoxPlotStatsD(col: Column & INumberColumn, raw?: boolean) {
    return this.cached('summary', col, () => {
      const ranking = col.findMyRanker()!.getOrder();
      const data = this.dataBoxPlotStats(col, raw);
      return {summary: this.boxplotBuilder(ranking, col, raw).next(Infinity).value!, data};
    }, raw ? ':braw' : ':b' , col.findMyRanker()!.getOrderLength() === 0);
  }

  private summaryCategoricalStatsD(col: Column & ICategoricalLikeColumn) {
    return this.cached('summary', col, () => {
      const ranking = col.findMyRanker()!.getOrder();
      const data = this.dataCategoricalStats(col);
      return {summary: this.categoricalStatsBuilder(ranking, col).next(Infinity).value!, data};
    }, '', col.findMyRanker()!.getOrderLength() === 0);
  }

  private summaryDateStatsD(col: Column & IDateColumn) {
    return this.cached('summary', col, () => {
      const ranking = col.findMyRanker()!.getOrder();
      const data = this.dataDateStats(col);
      return {summary: this.dateStatsBuilder(ranking, col, data).next(Infinity).value!, data};
    }, '', col.findMyRanker()!.getOrderLength() === 0);
  }

  private cached<T>(prefix: string, col: Column, creator: () => T, suffix: string = '', dontCache = false): T {
    const key = `${col.id}:${prefix}${suffix}`;
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    const s = creator();
    if (!dontCache) {
      this.cache.set(key, s);
    }
    return s;
  }

  dataBoxPlotStats(col: Column & INumberColumn, raw?: boolean) {
    return this.cached('data', col, () => this.boxplotBuilder(null, col, raw).next(Infinity).value!, raw ? ':braw' : ':b');
  }

  dataNumberStats(col: Column & INumberColumn, raw?: boolean) {
    return this.cached('data', col, () => this.normalizedStatsBuilder(null, col, getNumberOfBins(this.data.length), raw).next(Infinity).value!, raw ? ':raw' : '');
  }

  dataCategoricalStats(col: Column & ICategoricalLikeColumn) {
    return this.cached('data', col, () => this.categoricalStatsBuilder(null, col).next(Infinity).value!);
  }

  dataDateStats(col: Column & IDateColumn) {
    return this.cached('data', col, () => this.dateStatsBuilder(null, col).next(Infinity).value!);
  }

  terminate() {
    this.cache.clear();
  }
}


