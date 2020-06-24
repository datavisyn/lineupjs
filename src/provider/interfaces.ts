import {Column, Ranking, IColumnConstructor, IColumnDesc, IGroup, IndicesArray, IDataRow, IRankingDump, EAggregationState, IColorMappingFunctionConstructor, IMappingFunctionConstructor, ITypeFactory, INumberColumn} from '../model';
import {AEventDispatcher, ISequence} from '../internal';
import {IRenderTasks} from '../renderer';
import {IAbortAblePromise as IAbortAblePromiseImpl} from 'lineupengine';

export {ABORTED, abortAble, abortAbleAll, abortAbleResolveNow, isAbortAble, abortAbleFetch} from 'lineupengine';
export declare type IAbortAblePromise<T> = IAbortAblePromiseImpl<T>;

export declare type IAggregationStrategy = 'group' | 'item' | 'group+item' | 'group+top+item' | 'group+item+top';

export interface IDataProviderOptions {
  columnTypes: {[columnType: string]: IColumnConstructor};
  colorMappingFunctionTypes: {[colorMappingFunctionType: string]: IColorMappingFunctionConstructor};
  mappingFunctionTypes: {[mappingFunctionType: string]: IMappingFunctionConstructor};

  /**
   * allow just single selected rows
   * @default: false
   */
  singleSelection: boolean;

  /**
   * show top N rows as sample rows
   * @default 10
   */
  showTopN: number;

  /**
   * aggregation strategy to show upon grouping, see also showTopN
   * @default 'item'
   */
  aggregationStrategy: IAggregationStrategy;
}

export interface IDataProvider extends AEventDispatcher {
  readonly columnTypes: {[columnType: string]: IColumnConstructor};

  getTotalNumberOfRows(): number;

  getTaskExecutor(): IRenderTasks;

  getTypeFactory(): ITypeFactory;

  takeSnapshot(col: Column): void;

  selectAllOf(ranking: Ranking): void;

  getSelection(): number[];

  setSelection(dataIndices: IndicesArray): void;

  toggleSelection(i: number, additional?: boolean): boolean;

  isSelected(i: number): boolean;

  removeRanking(ranking: Ranking): void;

  ensureOneRanking(): void;

  find(id: string): Column | null;

  clone(col: Column): Column;

  create(desc: IColumnDesc): Column | null;

  toDescRef(desc: IColumnDesc): any;

  fromDescRef(ref: any): IColumnDesc;

  mappingSample(col: INumberColumn): Promise<ISequence<number>> | ISequence<number>;

  searchAndJump(search: string | RegExp, col: Column): void;

  getRankings(): Ranking[];

  getFirstRanking(): Ranking | null;
  getLastRanking(): Ranking;

  getColumns(): IColumnDesc[];

  getAggregationStrategy(): IAggregationStrategy;

  isAggregated(ranking: Ranking, group: IGroup): boolean;

  setAggregationState(ranking: Ranking, group: IGroup, state: EAggregationState): void;

  getAggregationState(ranking: Ranking, group: IGroup): EAggregationState;

  aggregateAllOf(ranking: Ranking, aggregateAll: boolean | number | EAggregationState, groups?: IGroup[]): void;

  getTopNAggregated(ranking: Ranking, group: IGroup): number;

  setTopNAggregated(ranking: Ranking, group: IGroup, value: number): void;

  setShowTopN(value: number): void;
  getShowTopN(): number;

  getRow(dataIndex: number): Promise<IDataRow> | IDataRow;

  clearFilters(): void;
}



export const SCHEMA_REF = `https://lineup.js.org/develop/schema.4.0.0.json`;

export interface IDataProviderDump {
  '$schema'?: string;
  /**
   * base for generating new uids
   */
  uid?: number;

  /**
   * current selection
   */
  selection?: number[];

  /**
   * list of aggregated group paths
   */
  aggregations?: string[] | {[key: string]: number};
  /**
   * ranking dumps
   */
  rankings?: IRankingDump[];

  /**
   * custom show top N setting
   */
  showTopN?: number;
}



export interface IDeriveOptions {
  /**
   * maximal percentage of unique values to be treated as a categorical column
   */
  categoricalThreshold: number | ((unique: number, total: number) => boolean);

  columns: string[];

  /**
   * date pattern to check for string matching them
   * @default %x
   */
  datePattern: string | string[];
}


export interface IExportOptions {
  /**
   * export separator, default: '\t'
   */
  separator: string;
  /**
   * new line character, default: '\n'
   */
  newline: string;
  /**
   * should a header be generated, default: true
   */
  header: boolean;
  /**
   * quote strings, default: false
   */
  quote: boolean;
  /**
   * quote string to use, default: '"'
   */
  quoteChar: string;
  /**
   * filter specific column types, default: exclude all support types (selection, action, rank)
   * @param col the column description to filter
   */
  filter: (col: Column) => boolean; //!isSupportType

  /**
   * whether the description should be part of the column header
   */
  verboseColumnHeaders: boolean;
}
