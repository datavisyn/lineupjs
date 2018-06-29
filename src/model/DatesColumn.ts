import {timeFormat, timeParse} from 'd3-time-format';
import {median, min, max} from 'd3-array';
import {dialogAddons} from './annotations';
import ArrayColumn, {IArrayColumnDesc, spliceChanged} from './ArrayColumn';
import Column, {widthChanged, labelChanged, metaDataChanged, dirty, dirtyHeader, dirtyValues, rendererTypeChanged, groupRendererChanged, summaryRendererChanged, visibilityChanged} from './Column';
import ValueColumn, {dataLoaded} from './ValueColumn';
import {IDateDesc} from './DateColumn';
import {IDataRow} from './interfaces';
import {FIRST_IS_MISSING, isMissingValue} from './missing';
import {IEventListener} from '../internal/AEventDispatcher';

export enum EDateSort {
  min = 'min',
  max = 'max',
  median = 'median'
}

export interface IDatesDesc extends IDateDesc {
  sort?: EDateSort;
}

export declare type IDatesColumnDesc = IDatesDesc & IArrayColumnDesc<Date>;

/**
 * emitted when the sort method property changes
 * @asMemberOf Column
 * @event
 */
export declare function sortMethodChanged(previous: EDateSort, current: EDateSort): void;

@dialogAddons('sort', 'sortDates')
export default class DatesColumn extends ArrayColumn<Date | null> {
  static readonly EVENT_SORTMETHOD_CHANGED = 'sortMethodChanged';

  private readonly format: (date: Date) => string;
  private readonly parse: (date: string) => Date | null;
  private sort: EDateSort;

  constructor(id: string, desc: Readonly<IDatesColumnDesc>) {
    super(id, desc);
    this.format = timeFormat(desc.dateFormat || '%x');
    this.parse = desc.dateParse ? timeParse(desc.dateParse) : timeParse(desc.dateFormat || '%x');
    this.sort = desc.sort || EDateSort.median;
    this.setDefaultRenderer('default');
  }

  protected createEventList() {
    return super.createEventList().concat([ArrayColumn.EVENT_SPLICE_CHANGED]);
  }

  on(type: typeof DatesColumn.EVENT_SORTMETHOD_CHANGED, listener: typeof sortMethodChanged | null): this;
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

  getValue(row: IDataRow): (Date | null)[] {
    return super.getValue(row).map((v) => {
      if (isMissingValue(v)) {
        return null;
      }
      if (v instanceof Date) {
        return v;
      }
      return this.parse(String(v));
    });
  }

  getLabels(row: IDataRow) {
    return this.getValue(row).map((v) => (v instanceof Date) ? this.format(v) : '');
  }

  getSortMethod() {
    return this.sort;
  }

  setSortMethod(sort: EDateSort) {
    if (this.sort === sort) {
      return;
    }
    this.fire([DatesColumn.EVENT_SORTMETHOD_CHANGED], this.sort, this.sort = sort);
    // sort by me if not already sorted by me
    if (!this.isSortedByMe().asc) {
      this.sortByMe();
    }
  }

  dump(toDescRef: (desc: any) => any): any {
    const r = super.dump(toDescRef);
    r.sortMethod = this.getSortMethod();
    return r;
  }

  restore(dump: any, factory: (dump: any) => Column | null) {
    super.restore(dump, factory);
    if (dump.sortMethod) {
      this.sort = dump.sortMethod;
    }
  }

  compare(a: IDataRow, b: IDataRow) {
    const av = <Date[]>this.getValue(a).filter(Boolean);
    const bv = <Date[]>this.getValue(b).filter(Boolean);
    if (av === bv) {
      return 0;
    }
    if (av.length === 0) {
      return bv.length === 0 ? 0 : FIRST_IS_MISSING;
    }
    if (bv.length === 0) {
      return -FIRST_IS_MISSING;
    }
    const as = compute(av, this.sort);
    const bs = compute(bv, this.sort);
    return as - bs;
  }
}

function compute(arr: Date[], sort: EDateSort) {
  switch (sort) {
    case EDateSort.min:
      return min(arr, (d) => d.getTime())!;
    case EDateSort.max:
      return max(arr, (d) => d.getTime())!;
    case EDateSort.median:
      return median(arr, (d) => d.getTime())!;
  }
}
