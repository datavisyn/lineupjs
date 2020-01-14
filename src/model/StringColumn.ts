import {Category, toolbar, dialogAddons} from './annotations';
import Column, {widthChanged, labelChanged, metaDataChanged, dirty, dirtyHeader, dirtyValues, rendererTypeChanged, groupRendererChanged, summaryRendererChanged, visibilityChanged, dirtyCaches} from './Column';
import {defaultGroup, IDataRow, IGroup, ECompareValueType, IValueColumnDesc, othersGroup, ITypeFactory} from './interfaces';
import {missingGroup, isMissingValue} from './missing';
import ValueColumn, {dataLoaded} from './ValueColumn';
import {equal, IEventListener} from '../internal';

export enum EAlignment {
  left = 'left',
  center = 'center',
  right = 'right'
}

export enum EStringGroupCriteriaType {
  value = 'value',
  startsWith = 'startsWith',
  regex = 'regex'
}

export interface IStringGroupCriteria {
  type: EStringGroupCriteriaType;
  values: (string | RegExp)[];
}

export interface IStringDesc {
  /**
   * column alignment: left, center, right
   * @default left
   */
  alignment?: EAlignment;

  /**
   * escape html tags
   */
  escape?: boolean;
}


export declare type IStringColumnDesc = IStringDesc & IValueColumnDesc<string>;

/**
 * emitted when the filter property changes
 * @asMemberOf StringColumn
 * @event
 */
export declare function filterChanged_SC(previous: string | RegExp | null, current: string | RegExp | null): void;


/**
 * emitted when the grouping property changes
 * @asMemberOf StringColumn
 * @event
 */
export declare function groupingChanged_SC(previous: (RegExp | string)[][], current: (RegExp | string)[][]): void;

/**
 * a string column with optional alignment
 */
@toolbar('search', 'groupBy', 'filterString')
@dialogAddons('group', 'groupString')
@Category('string')
export default class StringColumn extends ValueColumn<string> {
  static readonly EVENT_FILTER_CHANGED = 'filterChanged';
  static readonly EVENT_GROUPING_CHANGED = 'groupingChanged';

  //magic key for filtering missing ones
  static readonly FILTER_MISSING = '__FILTER_MISSING';
  private currentFilter: string | RegExp | null = null;

  readonly alignment: EAlignment;
  readonly escape: boolean;

  private currentGroupCriteria: IStringGroupCriteria = {
    type: EStringGroupCriteriaType.startsWith,
    values: []
  };

  constructor(id: string, desc: Readonly<IStringColumnDesc>) {
    super(id, desc);
    this.setDefaultWidth(200); //by default 200
    this.alignment = <any>desc.alignment || EAlignment.left;
    this.escape = desc.escape !== false;
  }


  protected createEventList() {
    return super.createEventList().concat([StringColumn.EVENT_GROUPING_CHANGED, StringColumn.EVENT_FILTER_CHANGED]);
  }

  on(type: typeof StringColumn.EVENT_FILTER_CHANGED, listener: typeof filterChanged_SC | null): this;
  on(type: typeof ValueColumn.EVENT_DATA_LOADED, listener: typeof dataLoaded | null): this;
  on(type: typeof StringColumn.EVENT_GROUPING_CHANGED, listener: typeof groupingChanged_SC | null): this;
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

  getValue(row: IDataRow): string | null {
    const v: any = super.getValue(row);
    return isMissingValue(v) ? null : String(v);
  }

  getLabel(row: IDataRow) {
    return this.getValue(row) || '';
  }

  dump(toDescRef: (desc: any) => any): any {
    const r = super.dump(toDescRef);
    if (this.currentFilter instanceof RegExp) {
      r.filter = `REGEX:${(<RegExp>this.currentFilter).source}`;
    } else {
      r.filter = this.currentFilter;
    }
    if (this.currentGroupCriteria) {
      const {type, values} = this.currentGroupCriteria;
      r.groupCriteria = {
        type,
        values: values.map((value) => `${type}:${value instanceof RegExp && type === EStringGroupCriteriaType.regex ? value.source : value}`)
      };
    }
    return r;
  }

  restore(dump: any, factory: ITypeFactory) {
    super.restore(dump, factory);
    if (dump.filter && (<string>dump.filter).startsWith('REGEX:')) {
      this.currentFilter = new RegExp(dump.filter.slice(6), 'gm');
    } else {
      this.currentFilter = dump.filter || null;
    }
    // tslint:disable-next-line: early-exit
    if (dump.groupCriteria) {
      const {type, values} = <IStringGroupCriteria>dump.groupCriteria;
      this.currentGroupCriteria = {
        type,
        values: values.map((value) => type === EStringGroupCriteriaType.regex ? new RegExp(<string>value, 'gm') : value)
      };
    }
  }

  isFiltered() {
    return this.currentFilter != null;
  }

  filter(row: IDataRow) {
    if (!this.isFiltered()) {
      return true;
    }
    const r = this.getLabel(row);
    const filter = this.currentFilter;

    if (filter === StringColumn.FILTER_MISSING) { //filter empty
      return r != null && r.trim() !== '';
    }
    if (typeof filter === 'string' && filter.length > 0) {
      return r !== '' && r.toLowerCase().indexOf(filter.toLowerCase()) >= 0;
    }
    if (filter instanceof RegExp) {
      return r !== '' && r.match(filter) != null; // You can not use RegExp.test(), because of https://stackoverflow.com/a/6891667
    }
    return true;
  }

  getFilter() {
    return this.currentFilter;
  }

  setFilter(filter: string | RegExp | null) {
    if (filter === '') {
      filter = null;
    }
    if (this.currentFilter === filter) {
      return;
    }
    this.fire([StringColumn.EVENT_FILTER_CHANGED, Column.EVENT_DIRTY_VALUES, Column.EVENT_DIRTY], this.currentFilter, this.currentFilter = filter);
  }

  clearFilter() {
    const was = this.isFiltered();
    this.setFilter(null);
    return was;
  }

  getGroupCriteria(): IStringGroupCriteria {
    return this.currentGroupCriteria;
  }

  setGroupCriteria(value: IStringGroupCriteria) {
    if (equal(this.currentGroupCriteria, value) || value == null) {
      return;
    }
    const bak = this.getGroupCriteria();
    this.currentGroupCriteria = value;
    this.fire([StringColumn.EVENT_GROUPING_CHANGED, Column.EVENT_DIRTY_VALUES, Column.EVENT_DIRTY], bak, value);
  }

  group(row: IDataRow): IGroup {
    if (this.getValue(row) == null) {
      return Object.assign({}, missingGroup);
    }

    if (!this.currentGroupCriteria) {
      return Object.assign({}, othersGroup);
    }
    const value = this.getLabel(row);

    if (!value) {
      return Object.assign({}, missingGroup);
    }

    const {type, values} = this.currentGroupCriteria;
    if (type === EStringGroupCriteriaType.value) {
      return {
        name: value,
        color: defaultGroup.color
      };
    }
    for (const groupValue of values) {
      if (type === EStringGroupCriteriaType.startsWith && typeof groupValue === 'string' && value.startsWith(groupValue)) {
        return {
          name: groupValue,
          color: defaultGroup.color
        };
      }
      // tslint:disable-next-line: early-exit
      if (type === EStringGroupCriteriaType.regex && groupValue instanceof RegExp && groupValue.test(value)) {
        return {
          name: groupValue.source,
          color: defaultGroup.color
        };
      }
    }
    return Object.assign({}, othersGroup);
  }


  toCompareValue(row: IDataRow) {
    const v = this.getValue(row);
    return v === '' || v == null ? null : v.toLowerCase();
  }

  toCompareValueType() {
    return ECompareValueType.STRING;
  }
}

