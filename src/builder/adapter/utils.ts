export { equal } from '../../internal';

export function isTypeInstance(clazz: any, superClass: any) {
  let c = clazz;
  while (c && c !== superClass) {
    c = c.__proto__;
  }
  return c === superClass;
}

export function pick<T extends object>(obj: T, keys: (keyof T)[]): Pick<T, keyof T> {
  const r: Pick<T, keyof T> = <any>{};
  keys.forEach((k) => {
    if (obj.hasOwnProperty(k)) {
      r[k] = obj[k];
    }
  });
  return r;
}

export function isSame<T extends object>(current: T, changed: (prop: keyof T) => boolean, props: (keyof T)[]) {
  if (props.every((p) => !changed(p))) {
    return null;
  }
  return pick(current, props);
}
