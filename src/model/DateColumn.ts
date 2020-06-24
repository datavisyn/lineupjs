import {timeFormat, timeParse} from 'd3-time-format';
import {ISequence, equal, IEventListener} from '../internal';
import {Category, dialogAddons, toolbar} from './annotations';
import Column, {dirty, dirtyCaches, dirtyHeader, dirtyValues, groupRendererChanged, labelChanged, metaDataChanged, rendererTypeChanged, summaryRendererChanged, visibilityChanged, widthChanged} from './Column';
import {IDateColumn, IDateDesc, IDateFilter, IDateGrouper} from './IDateColumn';
import {defaultGroup, IDataRow, IGroup, ECompareValueType, IValueColumnDesc, DEFAULT_COLOR, ITypeFactory} from './interfaces';
import {isMissingValue, isUnknown, missingGroup} from './missing';
import ValueColumn, {dataLoaded} from './ValueColumn';
import {noDateFilter, defaultDateGrouper, isDummyDateFilter, isDefaultDateGrouper, restoreDateFilter, isEqualDateFilter, isDateIncluded, toDateGroup, chooseAggregatedDate} from './internalDate';
import {integrateDefaults} from './internal';


export declare type IDateColumnDesc = IValueColumnDesc<Date> & IDateDesc;

/**
 * emitted when the filter property changes
 * @asMemberOf DateColumn
 * @event
 */
export declare function filterChanged_DC(previous: IDateFilter | null, current: IDateFilter | null): void;

/**
 * emitted when the grouping property changes
 * @asMemberOf DateColumn
 * @event
 */
export declare function groupingChanged_DC(previous: IDateGrouper | null, current: IDateGrouper | null): void;

@toolbar('rename', 'clone', 'sort', 'sortBy', 'groupBy', 'sortGroupBy', 'filterDate')
@dialogAddons('group', 'groupDate')
@Category('date')
export default class DateColumn extends ValueColumn<Date> implements IDateColumn {
  static readonly EVENT_FILTER_CHANGED = 'filterChanged';
  static readonly EVENT_GROUPING_CHANGED = 'groupingChanged';

  static readonly DEFAULT_DATE_FORMAT = '%x';

  private readonly format: (date: Date | null) => string;
  private readonly parse: (date: string) => Date | null;

  /**
   * currently active filter
   * @type {{min: number, max: number}}
   * @private
   */
  private currentFilter: IDateFilter = noDateFilter();
  private currentGrouper: IDateGrouper = defaultDateGrouper();

  constructor(id: string, desc: Readonly<IDateColumnDesc>) {
    super(id, integrateDefaults(desc, {
      groupRenderer: 'datehistogram',
      summaryRenderer: 'datehistogram'
    }));
    const f = timeFormat(desc.dateFormat || DateColumn.DEFAULT_DATE_FORMAT);
    this.format = (v) => (v instanceof Date) ? f(v) : '';
    this.parse = desc.dateParse ? timeParse(desc.dateParse) : timeParse(desc.dateFormat || DateColumn.DEFAULT_DATE_FORMAT);
  }

  getFormatter() {
    return this.format;
  }

  getParser() {
    return this.parse;
  }

  dump(toDescRef: (desc: any) => any) {
    const r = super.dump(toDescRef);
    r.filter = isDummyDateFilter(this.currentFilter) ? null : this.currentFilter;
    if (this.currentGrouper && !isDefaultDateGrouper(this.currentGrouper)) {
      r.grouper = this.currentGrouper;
    }
    return r;
  }

  restore(dump: any, factory: ITypeFactory) {
    super.restore(dump, factory);
    if (dump.filter) {
      this.currentFilter = restoreDateFilter(dump.filter);
    }
    if (dump.grouper) {
      this.currentGrouper = dump.grouper;
    }
  }

  protected createEventList() {
    return super.createEventList().concat([DateColumn.EVENT_FILTER_CHANGED, DateColumn.EVENT_GROUPING_CHANGED]);
  }

  on(type: typeof DateColumn.EVENT_FILTER_CHANGED, listener: typeof filterChanged_DC | null): this;
  on(type: typeof DateColumn.EVENT_GROUPING_CHANGED, listener: typeof groupingChanged_DC | null): this;
  on(type: typeof ValueColumn.EVENT_DATA_LOADED, listener: typeof dataLoaded | null): this;
  on(type: typeof Column.EVENT_WIDTH_CHANGED, listener: typeof widthChanged | null): this;
  on(type: typeof Column.EVENT_LABEL_CHANGED, listener: typeof labelChanged | null): this;
  on(type: typeof Column.EVENT_METADATA_CHANGED, listener: typeof metaDataChanged | null): this;
  on(type: typeof Column.EVENT_DIRTY, listener: typeof dirty | null): this;
  on(type: typeof Column.EVENT_DIRTY_HEADER, listener: typeof dirtyHeader | null): this;
  on(type: typeof Column.EVENT_DIRTY_VALUES, listener: typeof dirtyValues | null): this;
  on(type: typeof Column.EVENT_DIRTY_CACHES, listener: typeof dirtyCaches | null): this;
  on(type: typeof Column.EVENT_RENDERER_TYPE_CHANGED, listener: typeof rendererTypeChanged | null): this;
  on(type: typeof Column.EVENT_GROUP_RENDERER_TYPE_CHANGED, listener: typeof groupRendererChanged | null): this;
  on(type: typeof Column.EVENT_SUMMARY_RENDERER_TYPE_CHANGED, listener: typeof summaryRendererChanged | null): this;
  on(type: typeof Column.EVENT_VISIBILITY_CHANGED, listener: typeof visibilityChanged | null): this;
  on(type: string | string[], listener: IEventListener | null): this; // required for correct typings in *.d.ts
  on(type: string | string[], listener: IEventListener | null): this {
    return super.on(<any>type, listener);
  }

  getValue(row: IDataRow): Date | null {
    return this.getDate(row);
  }

  getDate(row: IDataRow) {
    const v = super.getValue(row);
    if (isMissingValue(v)) {
      return null;
    }
    if (v instanceof Date) {
      return v;
    }
    return this.parse(String(v));
  }

  iterDate(row: IDataRow) {
    return [this.getDate(row)];
  }

  getLabel(row: IDataRow) {
    const v = this.getValue(row);
    return this.format(v);
  }

  isFiltered() {
    return !isDummyDateFilter(this.currentFilter);
  }

  clearFilter() {
    const was = this.isFiltered();
    this.setFilter(null);
    return was;
  }

  getFilter(): IDateFilter {
    return Object.assign({}, this.currentFilter);
  }

  setFilter(value: IDateFilter | null) {
    value = value || {min: -Infinity, max: +Infinity, filterMissing: false};
    if (isEqualDateFilter(value, this.currentFilter)) {
      return;
    }
    const bak = this.getFilter();
    this.currentFilter.min = isUnknown(value.min) ? -Infinity : value.min;
    this.currentFilter.max = isUnknown(value.max) ? Infinity : value.max;
    this.currentFilter.filterMissing = value.filterMissing;
    this.fire([DateColumn.EVENT_FILTER_CHANGED, Column.EVENT_DIRTY_VALUES, Column.EVENT_DIRTY], bak, this.getFilter());
  }

  /**
   * filter the current row if any filter is set
   * @param row
   * @returns {boolean}
   */
  filter(row: IDataRow, valueCache?: any) {
    return isDateIncluded(this.currentFilter, valueCache !== undefined ? valueCache : this.getDate(row));
  }

  toCompareValue(row: IDataRow, valueCache?: any) {
    const v = valueCache !== undefined ? valueCache : this.getValue(row);
    if (!(v instanceof Date)) {
      return NaN;
    }
    return v.getTime();
  }

  toCompareValueType() {
    return ECompareValueType.DOUBLE_ASC;
  }

  getDateGrouper() {
    return Object.assign({}, this.currentGrouper);
  }

  setDateGrouper(value: IDateGrouper) {
    if (equal(this.currentGrouper, value)) {
      return;
    }
    const bak = this.getDateGrouper();
    this.currentGrouper = Object.assign({}, value);
    this.fire([DateColumn.EVENT_GROUPING_CHANGED, Column.EVENT_DIRTY_VALUES, Column.EVENT_DIRTY], bak, value);
  }

  group(row: IDataRow, valueCache?: any): IGroup {
    const v = valueCache !== undefined ? valueCache : this.getDate(row);
    if (!v || !(v instanceof Date)) {
      return Object.assign({}, missingGroup);
    }
    if (!this.currentGrouper) {
      return Object.assign({}, defaultGroup);
    }
    const g = toDateGroup(this.currentGrouper, v);
    return {
      name: g.name,
      color: DEFAULT_COLOR
    };
  }

  toCompareGroupValue(rows: ISequence<IDataRow>, _group: IGroup, valueCache?: ISequence<any>): number {
    const v = chooseAggregatedDate(rows, this.currentGrouper, this, valueCache).value;
    return v == null ? NaN : v;
  }

  toCompareGroupValueType() {
    return ECompareValueType.DOUBLE_ASC;
  }
}
