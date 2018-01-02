import Column from './Column';
import {IDataRow} from './interfaces';
import ValueColumn, {IValueColumnDesc} from './ValueColumn';


export interface IMapDesc {
  readonly escape?: boolean;
}

export interface IKeyValue<T> {
  key: string;
  value: T;
}

export interface IMapColumnDesc<T> extends IMapDesc, IValueColumnDesc<IKeyValue<T>[]> {
  // dummy
}

export interface IMapColumn<T> {
  getMap(row: IDataRow): IKeyValue<T>[];

  getMapLabel(row: IDataRow): IKeyValue<string>[];
}

export function isMapColumn(col: any): col is IMapColumn<any> {
  return typeof col.getMap === 'function' &&  typeof col.getMapLabel === 'function' && col instanceof Column;
}

export default class MapColumn<T> extends ValueColumn<IKeyValue<T>[]> implements IMapColumn<T> {

  constructor(id: string, desc: IMapColumnDesc<T>) {
    super(id, desc);
    this.setWidthImpl(200); //by default 200
  }

  getValue(row: IDataRow) {
    return toKeyValue<T>(<any>super.getValue(row));
  }

  getLabels(row: IDataRow): IKeyValue<string>[] {
    const v = this.getValue(row);
    return v.map(({key, value}) => ({key, value: String(value)}));
  }

  getMap(row: IDataRow) {
    return this.getValue(row);
  }

  getMapLabel(row: IDataRow) {
    return this.getLabels(row);
  }

  getLabel(row: IDataRow) {
    const v = this.getLabels(row);
    return `{${v.map(({key, value}) => `${key}: ${value}`).join(', ')}}`;
  }
}

function byKey(a: IKeyValue<any>, b: IKeyValue<any>) {
  if (a === b) {
    return 0;
  }
  return a.key.localeCompare(b.key);
}

function toKeyValue<T>(v?: Map<string, T> | { [key: string]: T } | IKeyValue<T>[]): IKeyValue<T>[] {
  if (!v) {
    return [];
  }
  if (v instanceof Map) {
    return Array.from(v.entries()).map(([key, value]) => ({key, value})).sort(byKey);
  }
  if (Array.isArray(v)) {
    return v; // keep original order
  }
  // object
  return Object.keys(v).map((key) => ({key, value: v[key]})).sort(byKey);
}