export interface IBin<T> {
  /**
   * bin start
   */
  x0: T;
  /**
   * bin end
   */
  x1: T;
  /**
   * bin count
   */
  count: number;
}

export declare type INumberBin = IBin<number>;

export interface IBoxPlotData {
  readonly min: number;
  readonly max: number;
  readonly median: number;
  readonly q1: number;
  readonly q3: number;
  readonly outlier?: number[];
  readonly whiskerLow?: number;
  readonly whiskerHigh?: number;
}

export interface IAdvancedBoxPlotData extends IBoxPlotData {
  readonly mean: number;

  readonly missing: number;
  readonly count: number;
}

export interface IHistogramStats<T> {
  readonly min: T | null;
  readonly max: T | null;

  readonly missing: number;
  readonly count: number;

  readonly maxBin: number;
  readonly hist: ReadonlyArray<IBin<T>>;
}

export interface IStatistics extends IHistogramStats<number> {
  readonly mean: number;
}

export interface ICategoricalBin {
  cat: string;
  count: number;
}

export declare type IDateBin = IBin<Date>;

export interface ICategoricalStatistics {
  readonly missing: number;
  readonly count: number;

  readonly maxBin: number;
  readonly hist: ReadonlyArray<ICategoricalBin>;
}

export declare type IDateHistGranularity = 'year' | 'month' | 'day';

export interface IDateStatistics extends IHistogramStats<Date> {
  readonly histGranularity: IDateHistGranularity;
}

export interface IStringStatistics {
  readonly missing: number;
  readonly count: number;
  readonly unique: number;
  readonly topN: readonly { value: string; count: number }[];
}
