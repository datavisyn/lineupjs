import {abortAbleAll, IAbortAblePromise, ABORTED} from 'lineupengine';
import {ANOTHER_ROUND} from '../internal/scheduler';
import {IForEachAble, lazySeq, boxplotBuilder, categoricalStatsBuilder, categoricalValueCacheBuilder, dateStatsBuilder, dateValueCacheBuilder, IAdvancedBoxPlotData, ICategoricalStatistics, IDateStatistics, IStatistics, normalizedStatsBuilder, dateValueCache2Value, categoricalValueCache2Value, joinIndexArrays, IBuilder, ISequence} from '../internal';
import {CategoricalColumn, Column, ICompareValue, DateColumn, ICategoricalLikeColumn, IDataRow, IDateColumn, IGroup, ImpositionCompositeColumn, IndicesArray, INumberColumn, NumberColumn, OrdinalColumn, Ranking, UIntTypedArray, ICategory} from '../model';
import {IRenderTask, IRenderTasks} from '../renderer';
import {CompareLookup} from './sort';


/**
 * a render task that is already resolved
 */
export class TaskNow<T> implements IRenderTask<T> {
  constructor(public readonly v: T | symbol) {

  }

  then<U = void>(onfullfilled: (value: T | symbol) => U) {
    return onfullfilled(this.v);
  }
}

/**
 * factory function for
 */
export function taskNow<T>(v: T) {
  return new TaskNow(v);
}


export function abortedTask<T>(): IRenderTask<T> {
  return new TaskNow<T>(ABORTED);
}

/**
 * a render task based on an abortable promise
 */
export class TaskLater<T> implements IRenderTask<T> {
  constructor(public readonly v: IAbortAblePromise<T>) {

  }

  then<U = void>(onfullfilled: (value: T | symbol) => U): IAbortAblePromise<U> {
    return this.v.then(onfullfilled, () => onfullfilled(ABORTED));
  }
}

export function taskLater<T>(v: IAbortAblePromise<T>) {
  return new TaskLater(v);
}

/**
 * similar to Promise.all
 */
export function tasksAll<T>(tasks: IRenderTask<T>[]): IRenderTask<T[]> {
  if ((<(TaskNow<T> | TaskLater<T>)[]>tasks).some((d) => d.v === ABORTED)) {
    return abortedTask();
  }
  if (tasks.every((t) => t instanceof TaskNow)) {
    return taskNow(tasks.map((d) => <T>(<TaskNow<T>>d).v));
  }
  return taskLater(abortAbleAll((<(TaskNow<T> | TaskLater<T>)[]>tasks).map((d) => <T>d.v)));
}



export interface IRenderTaskExecutor extends IRenderTasks {
  setData(data: IDataRow[]): void;

  dirtyColumn(col: Column, type: 'data' | 'summary' | 'group'): void;
  dirtyRanking(ranking: Ranking, type: 'data' | 'summary' | 'group'): void;

  groupCompare(ranking: Ranking, group: IGroup, rows: IndicesArray): IRenderTask<ICompareValue[]>;

  preCompute(ranking: Ranking, groups: {rows: IndicesArray, group: IGroup}[], maxDataIndex: number): void;
  preComputeCol(col: Column): void;
  preComputeData(ranking: Ranking): void;
  copyData2Summary(ranking: Ranking): void;
  copyCache(col: Column, from: Column): void;

  sort(ranking: Ranking, group: IGroup, indices: IndicesArray, singleCall: boolean, maxDataIndex: number, lookups?: CompareLookup): Promise<IndicesArray>;

  terminate(): void;

  valueCache(col: Column): undefined | ((dataIndex: number) => any);
}

export class MultiIndices {
  private _joined: IndicesArray | null = null;

  constructor(public readonly indices: IndicesArray[], private readonly maxDataIndex: number) {

  }

  get joined() {
    if (this.indices.length === 1) {
      return this.indices[0];
    }
    if (this.indices.length === 0) {
      return new Uint8Array(0);
    }
    if (this._joined) {
      return this._joined;
    }
    return this._joined = joinIndexArrays(this.indices, this.maxDataIndex);
  }
}

/**
 * number of data points to build per iteration / chunk
 */
const CHUNK_SIZE = 100;


export class ARenderTasks {
  protected readonly valueCacheData = new Map<string, Float32Array | UIntTypedArray | Int32Array | Float64Array>();

  protected readonly byIndex = (i: number) => this.data[i];

  constructor(protected data: IDataRow[] = []) {

  }


  protected byOrder(indices: IndicesArray): ISequence<IDataRow> {
    return lazySeq(indices).map(this.byIndex);
  }

  protected byOrderAcc<T>(indices: IndicesArray, acc: (row: IDataRow) => T) {
    return lazySeq(indices).map((i) => acc(this.data[i]));
  }

  /**
   * builder factory to create an iterator that can be used to schedule
   * @param builder the builder to use
   * @param order the order to iterate over
   * @param acc the accessor to get the value out of the data
   * @param build optional build mapper
   */
  private builder<T, BR, B extends {push: (v: T) => void, build: () => BR}, R = BR>(builder: B, order: IndicesArray | null | MultiIndices, acc: (dataIndex: number) => T, build?: (r: BR) => R): Iterator<R | null> {
    let i = 0;

    // no indices given over the whole data
    const nextData = (currentChunkSize: number = CHUNK_SIZE) => {
      let chunkCounter = currentChunkSize;
      const data = this.data;
      for (; i < data.length && chunkCounter > 0; ++i, --chunkCounter) {
        builder.push(acc(i));
      }
      if (i < data.length) { // need another round
        return ANOTHER_ROUND;
      }
      // done
      return {
        done: true,
        value: build ? build(builder.build()) : <R><any>builder.build()
      };
    };

    let o = 0;
    const orders = order instanceof MultiIndices ? order.indices : [order];

    const nextOrder = (currentChunkSize: number = CHUNK_SIZE) => {
      let chunkCounter = currentChunkSize;

      while (o < orders.length) {
        const actOrder = orders[o]!;
        for (; i < actOrder.length && chunkCounter > 0; ++i, --chunkCounter) {
          builder.push(acc(actOrder[i]));
        }
        if (i < actOrder.length) { // need another round
          return ANOTHER_ROUND;
        }
        // done with this order
        o++;
        i = 0;
      }
      return {
        done: true,
        value: build ? build(builder.build()) : <R><any>builder.build()
      };
    };
    return {next: order == null ? nextData : nextOrder};
  }

  private builderForEach<T, BR, B extends {pushAll: (v: IForEachAble<T>) => void, build: () => BR}, R = BR>(builder: B, order: IndicesArray | null | MultiIndices, acc: (dataIndex: number) => IForEachAble<T>, build?: (r: BR) => R): Iterator<R | null> {
    return this.builder({
      push: builder.pushAll,
      build: builder.build
    }, order, acc, build);
  }

  protected boxplotBuilder<R = IAdvancedBoxPlotData>(order: IndicesArray | null | MultiIndices, col: INumberColumn, raw?: boolean, build?: (stat: IAdvancedBoxPlotData) => R) {
    const b = boxplotBuilder();
    return this.numberStatsBuilder(b, order, col, raw, build);
  }

  protected normalizedStatsBuilder<R = IStatistics>(order: IndicesArray | null | MultiIndices, col: INumberColumn, numberOfBins: number, raw?: boolean, build?: (stat: IStatistics) => R) {
    const b = normalizedStatsBuilder(numberOfBins);
    return this.numberStatsBuilder(b, order, col, raw, build);
  }

  private numberStatsBuilder<R, B extends IBuilder<number, BR>, BR>(b: B, order: IndicesArray | null | MultiIndices, col: INumberColumn, raw?: boolean, build?: (stat: BR) => R) {
    if (col instanceof NumberColumn || col instanceof OrdinalColumn || col instanceof ImpositionCompositeColumn) {
      const key = raw ? `${col.id}:r` : col.id;
      const dacc: (i: number) => number = raw ? (i) => col.getRawNumber(this.data[i]) : (i) => col.getNumber(this.data[i]);

      if (order == null && !this.valueCacheData.has(key)) {
        // build and valueCache
        const vs = new Float32Array(this.data.length);
        let i = 0;
        return this.builder({
          push: (v) => {
            b.push(v);
            vs[i++] = v;
          },
          build: () => {
            this.setValueCacheData(key, vs);
            return b.build();
          }
        }, null, dacc, build);
      }

      const cache = this.valueCacheData.get(key);
      const acc: (i: number) => number = cache ? (i) => cache[i] : dacc;
      return this.builder(b, order, acc, build);
    }
    const acc: (i: number) => IForEachAble<number> = raw ? (i) => col.iterRawNumber(this.data[i]) : (i) => col.iterNumber(this.data[i]);
    return this.builderForEach(b, order, acc, build);
  }

  protected dateStatsBuilder<R = IDateStatistics>(order: IndicesArray | null | MultiIndices, col: IDateColumn, template?: IDateStatistics, build?: (stat: IDateStatistics) => R) {
    const b = dateStatsBuilder(template);
    if (col instanceof DateColumn) {
      if (order == null) {
        // build and valueCache
        const vs = dateValueCacheBuilder(this.data.length);
        return this.builder({
          push: (v) => {
            b.push(v);
            vs.push(v);
          },
          build: () => {
            this.setValueCacheData(col.id, vs.cache);
            return b.build();
          }
        }, null, (i: number) => col.getDate(this.data[i]), build);
      }
      const cache = this.valueCacheData.get(col.id);
      const acc: (i: number) => Date | null = cache ? (i) => dateValueCache2Value(cache[i]) : (i) => col.getDate(this.data[i]);
      return this.builder(b, order, acc, build);
    }
    return this.builderForEach(b, order, (i: number) => col.iterDate(this.data[i]), build);
  }

  protected categoricalStatsBuilder<R = ICategoricalStatistics>(order: IndicesArray | null | MultiIndices, col: ICategoricalLikeColumn, build?: (stat: ICategoricalStatistics) => R) {
    const b = categoricalStatsBuilder(col.categories);
    if (col instanceof CategoricalColumn || col instanceof OrdinalColumn) {
      if (order == null) {
        // build and valueCache
        const vs = categoricalValueCacheBuilder(this.data.length, col.categories);
        return this.builder({
          push: (v) => {
            b.push(v);
            vs.push(v);
          },
          build: () => {
            this.setValueCacheData(col.id, vs.cache);
            return b.build();
          }
        }, null, (i: number) => col.getCategory(this.data[i]), build);
      }
      const cache = this.valueCacheData.get(col.id);
      const acc: (i: number) => ICategory | null = cache ? (i) => categoricalValueCache2Value(cache[i], col.categories) : (i) => col.getCategory(this.data[i]);
      return this.builder(b, order, acc, build);
    }
    return this.builderForEach(b, order, (i: number) => col.iterCategory(this.data[i]), build);
  }

  dirtyColumn(col: Column, type: 'data' | 'summary' | 'group') {
    if (type !== 'data') {
      return;
    }
    this.valueCacheData.delete(col.id);
    this.valueCacheData.delete(`${col.id}:r`);
  }

  protected setValueCacheData(key: string, value: Float32Array | UIntTypedArray | Int32Array | Float64Array | null) {
    if (value == null) {
      this.valueCacheData.delete(key);
    } else {
      this.valueCacheData.set(key, value);
    }
  }

  valueCache(col: Column) {
    const v = this.valueCacheData.get(col.id);
    if (!v) {
      return undefined;
    }
    if (col instanceof DateColumn) {
      return (dataIndex: number) => dateValueCache2Value(v[dataIndex]);
    }
    if (col instanceof CategoricalColumn || col instanceof OrdinalColumn) {
      return (dataIndex: number) => categoricalValueCache2Value(v[dataIndex], col.categories);
    }
    return (dataIndex: number) => v[dataIndex];
  }
}
