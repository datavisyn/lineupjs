import {IColumnDump, IOrderedGroup, Ranking} from '../../model';
import {IDateStatistics, ICategoricalStatistics, IAdvancedBoxPlotData, IStatistics} from '../../internal';


export interface IRemoteDataProviderOptions {
  /**
   * maximal cache size
   * @default 10000
   */
  maxCacheSize: number;

  /**
   * neighbors to preload when requesting an index
   * @default 50
   */
  loadNeighbors: number;

  /**
   * whether to precompute box plot statistics
   * @default false
   */
  precomputeBoxPlotStats: boolean | 'data' | 'summary' | 'group';
}

export interface IServerRankingDump {
  filter: IColumnDump[];
  sortCriteria: {asc: boolean, col: IColumnDump}[];
  groupCriteria: IColumnDump[];
  groupSortCriteria: {asc: boolean, col: IColumnDump}[];
}

/**
 * @internal
 */
export function toRankingDump(ranking: Ranking, toDescRef: (desc: any) => any) {
  return {
    filter: ranking.flatColumns.filter((d) => d.isFiltered()).map((d) => d.dump(toDescRef)),
    sortCriteria: ranking.getSortCriteria().map((d) => ({asc: d.asc, col: d.col.dump(toDescRef)})),
    groupCriteria: ranking.getGroupCriteria().map((d) => d.dump(toDescRef)),
    groupSortCriteria: ranking.getGroupSortCriteria().map((d) => ({asc: d.asc, col: d.col.dump(toDescRef)}))
  };
}

export interface IRawNormalizedStatistics {
  raw: IStatistics;
  normalized: IStatistics;
}

export interface IRawNormalizedAdvancedBoxPlotData {
  raw: IAdvancedBoxPlotData;
  normalized: IAdvancedBoxPlotData;
}

export declare type IRemoteStatistics = IDateStatistics | ICategoricalStatistics | IRawNormalizedStatistics | IRawNormalizedAdvancedBoxPlotData;

export enum ERemoteStatiticsType {
  categorical = 'categorical',
  date = 'date',
  number = 'number',
  boxplot = 'boxplot'
}

export interface IComputeColumn {
  dump: IColumnDump;
  type: ERemoteStatiticsType;
}

export interface ICustomAbortSignal {
  readonly aborted: boolean;
  onabort?(): void;
}

export interface IAbortOptions {
  signal?: ICustomAbortSignal;
}
/**
 * interface what the server side has to provide
 */
export interface IServerData {
  /**
   * total number of rows
   */
  readonly totalNumberOfRows: number;

  /**
   * sort the dataset by the given description
   * @param ranking
   */
  sort(ranking: IServerRankingDump, options: IAbortOptions): Promise<{groups: IOrderedGroup[], maxDataIndex: number}>;

  /**
   * returns a slice of the data array identified by a list of indices
   * @param indices
   */
  view(indices: number[], options: IAbortOptions): Promise<any[]>;

  /**
   * returns a sample of the values for a given column
   * @param column
   */
  mappingSample(column: IColumnDump, options: IAbortOptions): Promise<number[]>;

  /**
   * return the matching indices matching the given arguments
   * @param search
   * @param column
   */
  search(search: string | RegExp, column: IColumnDump, options: IAbortOptions): Promise<number[]>;

  /**
   * compute the data statistics for the given columns
   * @param columns column dumps
   */
  computeDataStats(columns: IComputeColumn[], options: IAbortOptions): Promise<IRemoteStatistics[]>;
  /**
   * compute the ranking statistics for the given columns
   * @param ranking ranking dump
   * @param columns column dumps
   */
  computeRankingStats(ranking: IServerRankingDump, columns: IComputeColumn[], options: IAbortOptions): Promise<IRemoteStatistics[]>;
  /**
   * compute the group statistics for the given columns
   * @param ranking ranking dump
   * @param group group name
   * @param columns column dumps
   */
  computeGroupStats(ranking: IServerRankingDump, group: string, columns: IComputeColumn[], options: IAbortOptions): Promise<IRemoteStatistics[]>;

}

