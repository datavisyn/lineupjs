import {IForEachAble} from '../internal';
import Column from './Column';
import {IColumnDesc, IDataRow} from './interfaces';
import {INumberFilter} from './INumberColumn';
import {IArrayColumn} from './IArrayColumn';

export interface IDateColumn extends Column {
  getFormatter(): (v: Date | null) => string;
  getParser(): (v: string) => Date | null;

  getDate(row: IDataRow): Date | null;

  iterDate(row: IDataRow): IForEachAble<Date | null>;

  getFilter(): IDateFilter;
  setFilter(value: IDateFilter | null): void;
}

export interface IDatesColumn extends IDateColumn, IArrayColumn<Date | null> {
  getDates(row: IDataRow): (Date | null)[];
}

export interface IDateDesc {
  /**
   * d3 formatting option
   * @default %x
   */
  dateFormat?: string;

  /**
   * d3 formation option
   * @dfeault dateFormat
   */
  dateParse?: string;
}


/**
 * checks whether the given column or description is a date column, i.e. the value is a date
 * @param col
 * @returns {boolean}
 */
export function isDateColumn(col: Column): col is IDateColumn;
export function isDateColumn(col: IColumnDesc): col is IDateDesc & IColumnDesc;
export function isDateColumn(col: Column | IColumnDesc) {
  return (col instanceof Column && typeof (<IDateColumn>col).getDate === 'function' || (!(col instanceof Column) && (<IColumnDesc>col).type.startsWith('date')));
}

export function isDatesColumn(col: Column): col is IDatesColumn {
  return typeof (<IDatesColumn>col).getDates === 'function';
}

export declare type IDateFilter = INumberFilter;

export declare type IDateGranularity = 'century' | 'decade' | 'year' | 'month' | 'week' | 'day_of_week' | 'day_of_month' | 'day_of_year' | 'hour' | 'minute' | 'second';

export interface IDateGrouper {
  /**
   * granuality level for the grouping
   */
  granularity: IDateGranularity;
  /**
   * whether circular occurrences should be in the same bin
   * e.g. granularity = month
   * circular: 01.2018 == 01.2017
   * not circular: 01.2018 != 01.2017
   */
  circular: boolean;
}
