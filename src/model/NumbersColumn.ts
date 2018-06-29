import {LazyBoxPlotData} from '../internal';
import {toolbar, SortByDefault, dialogAddons} from './annotations';
import ArrayColumn, {IArrayColumnDesc, IArrayDesc, spliceChanged} from './ArrayColumn';
import Column, {widthChanged, labelChanged, metaDataChanged, dirty, dirtyHeader, dirtyValues, rendererTypeChanged, groupRendererChanged, summaryRendererChanged, visibilityChanged} from './Column';
import ValueColumn, {dataLoaded} from './ValueColumn';
import {IDataRow} from './interfaces';
import {isDummyNumberFilter, restoreFilter} from './internal';
import {
  compareBoxPlot, DEFAULT_FORMATTER, EAdvancedSortMethod, getBoxPlotNumber, INumberFilter, INumbersColumn,
  noNumberFilter
} from './INumberColumn';
import {
  createMappingFunction, IMapAbleDesc, IMappingFunction, restoreMapping,
  ScaleMappingFunction
} from './MappingFunction';
import {isMissingValue} from './missing';
import NumberColumn from './NumberColumn';
import {IAdvancedBoxPlotData} from '../internal/math';
import {IEventListener} from '../internal/AEventDispatcher';


export interface INumbersDesc extends IArrayDesc, IMapAbleDesc {
  readonly sort?: EAdvancedSortMethod;
}

export declare type INumbersColumnDesc = INumbersDesc & IArrayColumnDesc<number>;

/**
 * emitted when the mapping property changes
 * @asMemberOf NumbersColumn
 * @event
 */
export declare function mappingChanged(previous: IMappingFunction, current: IMappingFunction): void;

/**
 * emitted when the sort method property changes
 * @asMemberOf NumbersColumn
 * @event
 */
export declare function sortMethodChanged(previous: EAdvancedSortMethod, current: EAdvancedSortMethod): void;

@toolbar('filterMapped')
@dialogAddons('sort', 'sortNumbers')
@SortByDefault('descending')
export default class NumbersColumn extends ArrayColumn<number> implements INumbersColumn {
  static readonly EVENT_MAPPING_CHANGED = NumberColumn.EVENT_MAPPING_CHANGED;
  static readonly EVENT_SORTMETHOD_CHANGED = NumberColumn.EVENT_SORTMETHOD_CHANGED;

  static readonly CENTER = 0;

  private sort: EAdvancedSortMethod;
  private mapping: IMappingFunction;
  private original: IMappingFunction;
  /**
   * currently active filter
   * @type {{min: number, max: number}}
   * @private
   */
  private currentFilter: INumberFilter = noNumberFilter();

  constructor(id: string, desc: Readonly<INumbersColumnDesc>) {
    super(id, desc);
    this.mapping = restoreMapping(desc);
    this.original = this.mapping.clone();

    this.sort = desc.sort || EAdvancedSortMethod.median;

    // better initialize the default with based on the data length
    if (this.dataLength) {
      this.setDefaultWidth(Math.min(Math.max(100, this.dataLength! * 10), 500));
    }
    this.setDefaultRenderer('heatmap');
    this.setDefaultGroupRenderer('heatmap');
    this.setDefaultSummaryRenderer('histogram');
  }

  compare(a: IDataRow, b: IDataRow): number {
    return compareBoxPlot(this, a, b);
  }

  getRawNumbers(row: IDataRow) {
    return this.getRawValue(row);
  }

  getBoxPlotData(row: IDataRow): IAdvancedBoxPlotData | null {
    const data = this.getRawValue(row);
    if (data == null) {
      return null;
    }
    return new LazyBoxPlotData(data, this.mapping);
  }

  getRange() {
    return this.mapping.getRange(DEFAULT_FORMATTER);
  }

  getRawBoxPlotData(row: IDataRow): IAdvancedBoxPlotData | null {
    const data = this.getRawValue(row);
    if (data == null) {
      return null;
    }
    return new LazyBoxPlotData(data);
  }

  getNumbers(row: IDataRow) {
    return this.getValue(row);
  }

  getNumber(row: IDataRow): number {
    return getBoxPlotNumber(this, row, 'normalized');
  }

  getRawNumber(row: IDataRow): number {
    return getBoxPlotNumber(this, row, 'raw');
  }

  getValue(row: IDataRow) {
    const values = this.getRawValue(row);
    return values.map((d) => isMissingValue(d) ? NaN : this.mapping.apply(d));
  }

  getRawValue(row: IDataRow) {
    const r = super.getValue(row);
    return r == null ? [] : r;
  }

  getLabels(row: IDataRow) {
    return this.getValue(row).map(DEFAULT_FORMATTER);
  }

  getSortMethod() {
    return this.sort;
  }

  setSortMethod(sort: EAdvancedSortMethod) {
    if (this.sort === sort) {
      return;
    }
    this.fire([NumbersColumn.EVENT_SORTMETHOD_CHANGED], this.sort, this.sort = sort);
    // sort by me if not already sorted by me
    if (!this.isSortedByMe().asc) {
      this.sortByMe();
    }
  }

  dump(toDescRef: (desc: any) => any): any {
    const r = super.dump(toDescRef);
    r.sortMethod = this.getSortMethod();
    r.filter = !isDummyNumberFilter(this.currentFilter) ? this.currentFilter : null;
    r.map = this.mapping.dump();
    return r;
  }

  restore(dump: any, factory: (dump: any) => Column | null) {
    super.restore(dump, factory);
    if (dump.sortMethod) {
      this.sort = dump.sortMethod;
    }
    if (dump.filter) {
      this.currentFilter = restoreFilter(dump.filter);
    }
    if (dump.map) {
      this.mapping = createMappingFunction(dump.map);
    } else if (dump.domain) {
      this.mapping = new ScaleMappingFunction(dump.domain, 'linear', dump.range || [0, 1]);
    }
  }

  protected createEventList() {
    return super.createEventList().concat([NumbersColumn.EVENT_MAPPING_CHANGED, NumbersColumn.EVENT_SORTMETHOD_CHANGED]);
  }

  on(type: typeof NumbersColumn.EVENT_MAPPING_CHANGED, listener: typeof mappingChanged | null): this;
  on(type: typeof NumbersColumn.EVENT_SORTMETHOD_CHANGED, listener: typeof sortMethodChanged | null): this;
  on(type: typeof ArrayColumn.EVENT_SPLICE_CHANGED, listener: typeof spliceChanged | null): this;
  on(type: typeof ValueColumn.EVENT_DATA_LOADED, listener: typeof dataLoaded | null): this;
  on(type: typeof Column.EVENT_WIDTH_CHANGED, listener: typeof widthChanged | null): this;
  on(type: typeof Column.EVENT_LABEL_CHANGED, listener: typeof labelChanged | null): this;
  on(type: typeof Column.EVENT_METADATA_CHANGED, listener: typeof metaDataChanged | null): this;
  on(type: typeof Column.EVENT_DIRTY, listener: typeof dirty | null): this;
  on(type: typeof Column.EVENT_DIRTY_HEADER, listener: typeof dirtyHeader | null): this;
  on(type: typeof Column.EVENT_DIRTY_VALUES, listener: typeof dirtyValues | null): this;
  on(type: typeof Column.EVENT_RENDERER_TYPE_CHANGED, listener: typeof rendererTypeChanged | null): this;
  on(type: typeof Column.EVENT_GROUP_RENDERER_TYPE_CHANGED, listener: typeof groupRendererChanged | null): this;
  on(type: typeof Column.EVENT_SUMMARY_RENDERER_TYPE_CHANGED, listener: typeof summaryRendererChanged | null): this;
  on(type: typeof Column.EVENT_VISIBILITY_CHANGED, listener: typeof visibilityChanged | null): this;
  on(type: string | string[], listener: IEventListener | null): this {
    return super.on(<any>type, listener);
  }

  getOriginalMapping() {
    return this.original.clone();
  }

  getMapping() {
    return this.mapping.clone();
  }

  setMapping(mapping: IMappingFunction) {
    if (this.mapping.eq(mapping)) {
      return;
    }
    this.fire([NumbersColumn.EVENT_MAPPING_CHANGED, Column.EVENT_DIRTY_VALUES, Column.EVENT_DIRTY], this.mapping.clone(), this.mapping = mapping);
  }

  isFiltered() {
    return NumberColumn.prototype.isFiltered.call(this);
  }

  getFilter(): INumberFilter {
    return NumberColumn.prototype.getFilter.call(this);
  }

  setFilter(value: INumberFilter = {min: -Infinity, max: +Infinity, filterMissing: false}) {
    NumberColumn.prototype.setFilter.call(this, value);
  }

  filter(row: IDataRow) {
    return NumberColumn.prototype.filter.call(this, row);
  }
}

