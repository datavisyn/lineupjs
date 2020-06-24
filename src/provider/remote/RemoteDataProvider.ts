import {LRUCache, IEventContext} from '../../internal';
import Column, {IColumnDesc, IDataRow, IndicesArray, INumberColumn, Ranking, CompositeColumn, EDirtyReason, IOrderedGroup, UIntTypedArray} from '../../model';
import {mapIndices} from '../../model/internal';
import ACommonDataProvider from '../ACommonDataProvider';
import {IDataProviderOptions} from '../interfaces';
import {IServerData, toRankingDump, IRemoteDataProviderOptions} from './interfaces';
import {index2pos} from '../internal';
import RemoteTaskExecutor from './RemoteTaskExecutor';
import {IRenderTasks} from '../../renderer';
import {CustomAbortSignal} from './internal';

/**
 * a remote implementation of the data provider
 */
export default class RemoteDataProvider extends ACommonDataProvider {
  private readonly ooptions: IRemoteDataProviderOptions = {
    maxCacheSize: 10000,
    loadNeighbors: 50,
    precomputeBoxPlotStats: false
  };

  private readonly sortAborter = new Map<string, {abort(): void}>();
  private readonly currentSort = new Map<string, {groups: IOrderedGroup[], index2pos: UIntTypedArray}>();
  private readonly cache: LRUCache<number, Promise<IDataRow> | IDataRow>;

  private readonly tasks: RemoteTaskExecutor;

  constructor(private server: IServerData, columns: IColumnDesc[] = [], options: Partial<IRemoteDataProviderOptions & IDataProviderOptions> = {}) {
    super(columns, options);
    Object.assign(this.ooptions, options);
    this.cache = new LRUCache(this.ooptions.maxCacheSize);
    this.tasks = new RemoteTaskExecutor(server, {
      viewRows: this.viewRows.bind(this),
      toDescRef: this.toDescRef,
      precomputeBoxPlotStats: this.ooptions.precomputeBoxPlotStats
    });
  }

  getTotalNumberOfRows() {
    return this.server.totalNumberOfRows;
  }

  getTaskExecutor(): IRenderTasks {
    return this.tasks;
  }

  cloneRanking(existing?: Ranking) {
    const ranking = super.cloneRanking(existing);
    this.trackRanking(ranking, existing);
    return ranking;
  }

  private trackRanking(ranking: Ranking, existing?: Ranking) {

    const that = this;
    ranking.on(`${Column.EVENT_DIRTY_CACHES}.cache`, function (this: IEventContext) {
      let col: any = this.origin;
      while (col instanceof Column) {
        //console.log(col.label, 'dirty data');
        that.tasks.dirtyColumn(col, 'data');
        that.tasks.preComputeCol(col);
        col = col.parent;
      }
    });

    const cols = ranking.flatColumns;
    const addKey = `${Ranking.EVENT_ADD_COLUMN}.cache`;
    const removeKey = `${Ranking.EVENT_REMOVE_COLUMN}.cache`;

    const removeCol = (col: Column) => {
      this.tasks.dirtyColumn(col, 'data');
      if (col instanceof CompositeColumn) {
        col.on(addKey, null);
        col.on(removeKey, null);
      }
    };

    const addCol = (col: Column) => {
      this.tasks.preComputeCol(col);
      if (col instanceof CompositeColumn) {
        col.on(addKey, addCol);
        col.on(removeKey, removeCol);
      }
    };


    ranking.on(addKey, addCol);
    ranking.on(removeKey, removeCol);
    for (const col of cols) {
      if (col instanceof CompositeColumn) {
        col.on(addKey, addCol);
        col.on(removeKey, removeCol);
      }
    }

    if (existing) {
      const copy = existing.flatColumns;
      for (let i = 0; i < cols.length; ++i) {
        this.tasks.copyCache(cols[i], copy[i]);
      }
    }

    this.tasks.preComputeData(ranking);
  }

  cleanUpRanking(ranking: Ranking) {
    const cols = ranking.flatColumns;
    const addKey = `${Ranking.EVENT_ADD_COLUMN}.cache`;
    const removeKey = `${Ranking.EVENT_REMOVE_COLUMN}.cache`;
    ranking.on(addKey, null);
    ranking.on(removeKey, null);
    for (const col of cols) {
      if (col instanceof CompositeColumn) {
        col.on(addKey, null);
        col.on(removeKey, null);
      }
    }

    this.tasks.dirtyRanking(ranking, 'data');
    this.sortAborter.delete(ranking.id);
    this.currentSort.delete(ranking.id);

    super.cleanUpRanking(ranking);
  }

  sort(ranking: Ranking, dirtyReason: EDirtyReason[]): Promise<{groups: IOrderedGroup[], index2pos: UIntTypedArray}> {
    if (this.sortAborter.has(ranking.id)) {
      this.sortAborter.get(ranking.id)!.abort();
    }
    const reasons = new Set(dirtyReason);

    const filter = ranking.flatColumns.filter((d) => d.isFiltered()).map((d) => d.dump(this.toDescRef));

    const needsFiltering = reasons.has(EDirtyReason.UNKNOWN) || reasons.has(EDirtyReason.FILTER_CHANGED);
    const needsGrouping = needsFiltering || reasons.has(EDirtyReason.GROUP_CRITERIA_CHANGED) || reasons.has(EDirtyReason.GROUP_CRITERIA_DIRTY);

    if (needsFiltering) {
      this.tasks.dirtyRanking(ranking, 'summary');
    } else if (needsGrouping) {
      this.tasks.dirtyRanking(ranking, 'group');
    }
    // otherwise the summary and group summaries should still be valid

    if (filter.length === 0) {
      // all rows so summary = data
      this.tasks.copyData2Summary(ranking);
    }

    const signal = new CustomAbortSignal();
    this.sortAborter.set(ranking.id, signal);

    return this.server.sort(toRankingDump(ranking, this.toDescRef), {signal}).then(({groups, maxDataIndex}) => {
      const r = index2pos(groups, maxDataIndex);

      // clean again since in the mean time old stuff could have been computed
      if (needsFiltering && filter.length > 0) {
        this.tasks.dirtyRanking(ranking, 'summary');
      } else if (needsGrouping) {
        this.tasks.dirtyRanking(ranking, 'group');
      }

      this.tasks.preCompute(ranking, groups);
      this.currentSort.set(ranking.id, r);
      return r;
    }).catch((error) => {
      if (signal.aborted) {
        // ok was aborted, so not a real error but the abort error
        console.log('error during sorting cause has been aborted', error);
      } else {
        console.error('error during sorting', error);
      }
      // return the current sorting of the ranking
      if (this.currentSort.has(ranking.id)) {
        return this.currentSort.get(ranking.id)!;
      }
      // return a dummy
      return {
        groups: <IOrderedGroup[]>[],
        index2pos: new Uint8Array(0)
      };
    });
  }

  view(indices: IndicesArray): Promise<any[]> {
    return this.viewRows(indices).then((rows: (IDataRow | null)[]) => rows.map((row) => row ? row.v : {}));
  }

  viewRows(indices: IndicesArray): Promise<IDataRow[]> {
    if (indices.length === 0) {
      return Promise.resolve([]);
    }
    const missing: number[] = [];
    let missingResolve: (value: IDataRow[]) => void;
    let missingReject: (reason?: any) => void;
    const missingLoader = new Promise<IDataRow[]>((resolve, reject) => {
      missingResolve = resolve;
      missingReject = reject;
    });
    const rows = mapIndices(indices, (i) => {
      const c = this.cache.get(i);
      if (c) {
        return c;
      }
      const missingIndex = missing.length;
      missing.push(i);
      const loader = missingLoader.then((loaded) => loaded[missingIndex]);
      this.cache.set(i, loader);
      return loader;
    });
    if (missing.length === 0) {
      return Promise.all(rows);
    }
    const loaded = this.load(missing);
    loaded.then((r) => missingResolve(r));
    loaded.catch((r) => missingReject(r));

    return Promise.all(rows);
  }

  private load(indices: number[]) {
    if (indices.length === 0) {
      return Promise.resolve<IDataRow[]>([]);
    }
    // load data and map to rows;
    return this.server.view(indices, {}).then((rows) => {
      //enhance with the data index
      return rows.map((v, i) => {
        const dataIndex = indices[i];
        const r = {v, i: dataIndex};
        this.cache.set(dataIndex, r);
        return r;
      });
    }).catch((error) => {
      console.error('error while fetching rows, creating not cached dummy rows', error);
      return indices.map((i) => {
        this.cache.delete(i); // delete loader cache entry
        return ({v: {}, i});
      });
    });
  }

  getRow(index: number) {
    if (this.cache.has(index)) {
      return this.cache.get(index)!;
    }
    return this.viewRows(this.guessRowsToLoad(index)).then((r) => r[0]);
  }

  private guessRowsToLoad(index: number) {
    const indices = new Set<number>([index]);
    for (const ranking of this.getRankings()) {
      const rank = ranking.getRank(index) - 1;
      if (rank < 0) {
        continue;
      }
      const order = ranking.getOrder();
      const startRank = Math.max(0, rank - this.ooptions.loadNeighbors);
      const endRank = Math.min(order.length - 1, rank + this.ooptions.loadNeighbors);

      for (let i = startRank; i <= endRank; ++i) {
        indices.add(order[i]);
      }
    }

    // enforce the first is the one to load
    indices.delete(index);
    const toLoad = Array.from(indices);
    toLoad.unshift(index);
    return toLoad;
  }


  mappingSample(col: INumberColumn): Promise<number[]> {
    const MAX_SAMPLE = 120; //at most 120 sample lines
    return this.server.mappingSample(col.dump(this.toDescRef), {})
      .catch((error) => {
        console.error('error during mapping sample, returning sample of cached indices', error);
        const indices = Array.from(this.cache.keys());
        if (indices.length > MAX_SAMPLE) {
          return indices.slice(0, MAX_SAMPLE);
        }
        return indices;
      });
  }

  searchAndJump(search: string | RegExp, col: Column) {
    this.server.search(search, col.dump(this.toDescRef), {}).then((indices) => {
      this.jumpToNearest(indices);
    }).catch((error) => {
      console.error('error during server side search', error);
      // nothing to do
    });
  }
}

