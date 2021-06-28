import Column, { IColumnDesc, IDataRow, Ranking, defaultGroup, IndicesArray, IOrderedGroup } from '../model';
import ACommonDataProvider from './ACommonDataProvider';
import type { IDataProviderOptions } from './interfaces';
import { DirectRenderTasks } from './DirectRenderTasks';
import type { IRenderTasks } from '../renderer';

/**
 * interface what the server side has to provide
 */
export interface IServerData {
  /**
   * sort the dataset by the given description
   * @param ranking
   */
  sort(ranking: Ranking): Promise<IndicesArray>;

  /**
   * returns a slice of the data array identified by a list of indices
   * @param indices
   */
  view(indices: number[]): Promise<any[]>;

  /**
   * returns a sample of the values for a given column
   * @param column
   */
  mappingSample(column: any): Promise<number[]>;

  /**
   * return the matching indices matching the given arguments
   * @param search
   * @param column
   */
  search(search: string | RegExp, column: any): Promise<number[]>;
}

export interface IRemoteDataProviderOptions {
  /**
   * maximal cache size (unused at the moment)
   */
  maxCacheSize: number;
}

function createIndex2Pos(order: IndicesArray) {
  const index2pos: number[] = [];
  for (let i = 0; i < order.length; ++i) {
    index2pos[order[i]] = i + 1;
  }
  return index2pos;
}

/**
 * a remote implementation of the data provider
 */
export default class RemoteDataProvider extends ACommonDataProvider {
  private readonly ooptions: IRemoteDataProviderOptions = {
    maxCacheSize: 1000,
  };

  private readonly cache = new Map<number, Promise<IDataRow>>();

  constructor(
    private server: IServerData,
    columns: IColumnDesc[] = [],
    options: Partial<IRemoteDataProviderOptions & IDataProviderOptions> = {}
  ) {
    super(columns, options);
    Object.assign(this.ooptions, options);
  }

  getTotalNumberOfRows() {
    // TODO not correct
    return this.cache.size;
  }

  getTaskExecutor(): IRenderTasks {
    // FIXME
    return new DirectRenderTasks();
  }

  sort(
    ranking: Ranking
  ):
    | Promise<{ groups: IOrderedGroup[]; index2pos: IndicesArray }>
    | { groups: IOrderedGroup[]; index2pos: IndicesArray } {
    //use the server side to sort
    return this.server
      .sort(ranking)
      .then((order) => ({ groups: [Object.assign({ order }, defaultGroup)], index2pos: createIndex2Pos(order) }));
  }

  private loadFromServer(indices: number[]) {
    return this.server.view(indices).then((view) => {
      //enhance with the data index
      return view.map((v, i) => {
        const dataIndex = indices[i];
        return { v, dataIndex };
      });
    });
  }

  view(indices: number[]): Promise<any[]> {
    if (indices.length === 0) {
      return Promise.resolve([]);
    }
    const base = this.fetch([indices])[0];
    return Promise.all(base).then((rows) => rows.map((d) => d.v));
  }

  private computeMissing(orders: number[][]): number[] {
    const union = new Set<number>();
    const unionAdd = union.add.bind(union);
    orders.forEach((order) => order.forEach(unionAdd));

    // removed cached
    this.cache.forEach((_v, k) => union.delete(k));

    if (this.cache.size + union.size > this.ooptions.maxCacheSize) {
      // clean up cache
    }
    // const maxLength = Math.max(...orders.map((o) => o.length));
    return Array.from(union);
  }

  private loadInCache(missing: number[]) {
    if (missing.length === 0) {
      return;
    }
    // load data and map to rows;
    const v = this.loadFromServer(missing);
    missing.forEach((_m, i) => {
      const dataIndex = missing[i];
      this.cache.set(
        dataIndex,
        v.then((loaded) => ({ v: loaded[i], i: dataIndex }))
      );
    });
  }

  fetch(orders: number[][]): Promise<IDataRow>[][] {
    const toLoad = this.computeMissing(orders);
    this.loadInCache(toLoad);

    return orders.map((order) => order.map((i) => this.cache.get(i)!));
  }

  getRow(index: number) {
    if (this.cache.has(index)) {
      return this.cache.get(index)!;
    }
    this.loadInCache([index]);
    return this.cache.get(index)!;
  }

  mappingSample(col: Column): Promise<number[]> {
    return this.server.mappingSample((col as any).desc.column);
  }

  searchAndJump(search: string | RegExp, col: Column) {
    this.server.search(search, (col as any).desc.column).then((indices) => {
      this.jumpToNearest(indices);
    });
  }
}
