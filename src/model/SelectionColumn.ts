import { Category, SupportType, toolbar } from './annotations';
import { IndicesArray, IDataRow, IGroup, ECompareValueType, IValueColumnDesc, ITypeFactory } from './interfaces';
import type {
  widthChanged,
  labelChanged,
  metaDataChanged,
  dirty,
  dirtyHeader,
  dirtyValues,
  rendererTypeChanged,
  groupRendererChanged,
  summaryRendererChanged,
  visibilityChanged,
  dirtyCaches,
} from './Column';
import Column from './Column';
import type { dataLoaded } from './ValueColumn';
import ValueColumn from './ValueColumn';
import type { IEventListener } from '../internal';
import { integrateDefaults } from './internal';

/**
 * factory for creating a description creating a rank column
 * @param label
 * @returns {{type: string, label: string}}
 */
export function createSelectionDesc(label = 'Selection Checkboxes') {
  return { type: 'selection', label, fixed: true };
}

export interface ISelectionColumnDesc extends IValueColumnDesc<boolean> {
  /**
   * setter for selecting/deselecting the given row
   */
  setter(index: number, value: boolean): void;

  /**
   * setter for selecting/deselecting the given row
   */
  setterAll(indices: IndicesArray, value: boolean): void;
}

/**
 * emitted when rows are selected
 * @asMemberOf SelectionColumn
 * @param dataIndex the (de)selected row
 * @param value true if selected else false
 * @param dataIndices in case of multiple rows are selected
 * @event
 */
export declare function select_SEC(dataIndex: number, value: boolean, dataIndices?: IndicesArray): void;

/**
 * emitted when the filter property changes
 * @asMemberOf SelectionColumn
 * @event
 */
export declare function filterChanged_SEC(previous: Set<number> | null, current: Set<number> | null): void;

/**
 * a checkbox column for selections
 */
@SupportType()
@toolbar('sort', 'sortBy', 'group', 'groupBy', 'invertSelection', 'filterSelection')
@Category('support')
export default class SelectionColumn extends ValueColumn<boolean> {
  static readonly EVENT_FILTER_CHANGED = 'filterChanged';
  static readonly EVENT_SELECT = 'select';

  private static SELECTED_GROUP: IGroup = {
    name: 'Selected',
    color: 'orange',
  };
  private static NOT_SELECTED_GROUP: IGroup = {
    name: 'Unselected',
    color: 'gray',
  };

  private currentFilter: Set<number> | null = null;

  constructor(id: string, desc: Readonly<ISelectionColumnDesc>) {
    super(
      id,
      integrateDefaults(desc, {
        width: 20,
      })
    );
  }

  get frozen() {
    return this.desc.frozen !== false;
  }

  protected createEventList() {
    return super.createEventList().concat([SelectionColumn.EVENT_SELECT, SelectionColumn.EVENT_FILTER_CHANGED]);
  }

  on(type: typeof SelectionColumn.EVENT_SELECT, listener: typeof select_SEC | null): this;
  on(type: typeof SelectionColumn.EVENT_FILTER_CHANGED, listener: typeof filterChanged_SEC | null): this;
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
    return super.on(type as any, listener);
  }

  setValue(row: IDataRow, value: boolean) {
    const old = this.getValue(row);
    if (old === value) {
      return true;
    }
    return this.setImpl(row, value);
  }

  setValues(rows: IndicesArray, value: boolean) {
    if (rows.length === 0) {
      return false;
    }
    if ((this.desc as ISelectionColumnDesc).setterAll) {
      (this.desc as ISelectionColumnDesc).setterAll(rows, value);
    }
    this.fire(SelectionColumn.EVENT_SELECT, rows[0], value, rows);
    return true;
  }

  private setImpl(row: IDataRow, value: boolean) {
    if ((this.desc as ISelectionColumnDesc).setter) {
      (this.desc as ISelectionColumnDesc).setter(row.i, value);
    }
    this.fire(SelectionColumn.EVENT_SELECT, row.i, value);
    return true;
  }

  toggleValue(row: IDataRow) {
    const old = this.getValue(row);
    this.setImpl(row, !old);
    return !old;
  }

  toCompareValue(row: IDataRow) {
    const v = this.getValue(row) === true;
    return v ? 1 : 0;
  }

  toCompareValueType() {
    return ECompareValueType.BINARY;
  }

  group(row: IDataRow) {
    const isSelected = this.getValue(row);
    return Object.assign({}, isSelected ? SelectionColumn.SELECTED_GROUP : SelectionColumn.NOT_SELECTED_GROUP);
  }

  dump(toDescRef: (desc: any) => any): any {
    const r = super.dump(toDescRef);
    r.filter = this.currentFilter ? Array.from(this.currentFilter).sort((a, b) => a - b) : null;
    return r;
  }

  restore(dump: any, factory: ITypeFactory) {
    super.restore(dump, factory);
    if (dump.filter) {
      const filter = dump.filter;
      this.currentFilter = new Set(filter);
    } else {
      this.currentFilter = null;
    }
  }

  isFiltered() {
    return this.currentFilter != null;
  }

  filter(row: IDataRow) {
    if (!this.isFiltered()) {
      return true;
    }
    const filter = this.currentFilter!;
    return filter.has(row.i);
  }

  getFilter(): number[] | null {
    return this.currentFilter == null ? null : Array.from(this.currentFilter);
  }

  setFilter(filter: number[] | null) {
    const newValue = filter ? new Set(filter) : null;
    if (areSameSets(newValue, this.currentFilter)) {
      return;
    }
    this.fire(
      [SelectionColumn.EVENT_FILTER_CHANGED, Column.EVENT_DIRTY_VALUES, Column.EVENT_DIRTY],
      this.currentFilter,
      (this.currentFilter = newValue)
    );
  }

  clearFilter() {
    const was = this.isFiltered();
    this.setFilter(null);
    return was;
  }
}

function areSameSets(a: Set<number> | null, b: Set<number> | null) {
  const aL = a != null ? a.size : 0;
  const bL = b != null ? b.size : 0;
  if (aL !== bL) {
    return false;
  }
  if (aL === 0 || bL === 0) {
    return true;
  }
  return Array.from(a).every((d) => b.has(d));
}
