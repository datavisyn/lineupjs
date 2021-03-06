import Column, {
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
import type { IDataRow, ITypeFactory } from './interfaces';
import StringColumn from './StringColumn';
import type { IEventListener } from '../internal';
import type { dataLoaded } from './ValueColumn';
import type ValueColumn from './ValueColumn';

/**
 * emitted when the filter property changes
 * @asMemberOf AnnotateColumn
 * @event
 */
export declare function filterChanged_AC(previous: string | RegExp | null, current: string | RegExp | null): void;

/**
 * emitted when the grouping property changes
 * @asMemberOf AnnotateColumn
 * @event
 */
export declare function groupingChanged_AC(previous: (RegExp | string)[][], current: (RegExp | string)[][]): void;

/**
 * emitted when the value of a row changes
 * @asMemberOf AnnotateColumn
 * @event
 */
export declare function valueChanged(dataIndex: number, previous: string, current: string): void;

/**
 * a string column in which the values can be edited locally
 */
export default class AnnotateColumn extends StringColumn {
  static readonly EVENT_VALUE_CHANGED = 'valueChanged';

  private readonly annotations = new Map<number, string>();

  protected createEventList() {
    return super.createEventList().concat([AnnotateColumn.EVENT_VALUE_CHANGED]);
  }

  on(type: typeof AnnotateColumn.EVENT_VALUE_CHANGED, listener: typeof valueChanged | null): this;
  on(type: typeof StringColumn.EVENT_FILTER_CHANGED, listener: typeof filterChanged_AC | null): this;
  on(type: typeof StringColumn.EVENT_GROUPING_CHANGED, listener: typeof groupingChanged_AC | null): this;
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

  getValue(row: IDataRow) {
    if (this.annotations.has(row.i)) {
      return this.annotations.get(row.i)!;
    }
    return super.getValue(row);
  }

  dump(toDescRef: (desc: any) => any): any {
    const r = super.dump(toDescRef);
    r.annotations = {};
    this.annotations.forEach((v, k) => {
      r.annotations[k] = v;
    });
    return r;
  }

  restore(dump: any, factory: ITypeFactory) {
    super.restore(dump, factory);
    if (!dump.annotations) {
      return;
    }
    Object.keys(dump.annotations).forEach((k) => {
      this.annotations.set(Number(k), dump.annotations[k]);
    });
  }

  setValue(row: IDataRow, value: string) {
    const old = this.getValue(row);
    if (old === value) {
      return true;
    }
    if (value === '' || value == null) {
      this.annotations.delete(row.i);
    } else {
      this.annotations.set(row.i, value);
    }
    this.fire(
      [AnnotateColumn.EVENT_VALUE_CHANGED, Column.EVENT_DIRTY_VALUES, Column.EVENT_DIRTY_CACHES, Column.EVENT_DIRTY],
      row.i,
      old,
      value
    );
    return true;
  }
}
