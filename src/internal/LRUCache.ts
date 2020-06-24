
interface ILRUNode<K, V> {
  prev: ILRUNode<K, V> | null;
  next: ILRUNode<K, V> | null;
  readonly key: K;
  readonly value: V;
}

class ListIterator<T, K, V> implements IterableIterator<T> {
  private current: ILRUNode<K, V> | null;

  constructor(private readonly youngest: ILRUNode<K, V> | null, private readonly toValue: (node: ILRUNode<K, V>) => T) {
    this.current = youngest ? youngest.next : null;
  }

  next() {
    if (this.current == null) {
      return {
        value: <T><any>undefined,
        done: true
      };
    }
    const n = this.current!;
    const value = this.toValue(n);
    if (n === this.youngest) {
      this.current = null; // end
    } else {
      this.current = n.next!;
    }
    return {
      value,
      done: false
    };
  }

  [Symbol.iterator]() {
    return new ListIterator(this.youngest, this.toValue);
  }
}

/**
 * simple LRU Cache implementation using a double linked list
 */
export default class LRUCache<K, V> implements Iterable<[K, V]> {
  readonly [Symbol.toStringTag] = 'LRUCache';
  private readonly map = new Map<K, ILRUNode<K, V>>();
  private youngest: ILRUNode<K, V> | null = null;

  constructor(private readonly maxSize: number = 100) {
    console.assert(maxSize > 0);
  }

  clear() {
    this.map.clear();
    this.youngest = null;
  }

  get size() {
    return this.map.size;
  }

  has(key: K) {
    return this.map.has(key);
  }

  delete(key: K) {
    if (!this.map.has(key)) {
      return false;
    }
    const v = this.map.get(key)!;
    this.map.delete(key);
    this.removeFromList(v);
    return true;
  }

  private removeFromList(v: ILRUNode<K, V>) {
    if (v.prev === v) {
      // one = last one
      this.youngest = null;
      return;
    }
    if (v === this.youngest) {
      this.youngest = v.prev;
    }
    v.prev!.next = v.next;
    v.next!.prev = v.prev;
  }

  private appendToList(v: ILRUNode<K, V>) {
    if (this.youngest === null) {
      // first
      v.next = v.prev = v;
    } else {
      v.next = this.youngest.next;
      v.prev = this.youngest;
      v.next!.prev = v;
      this.youngest.next = v;
    }
    this.youngest = v;
  }

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) {
      return undefined;
    }
    if (this.youngest === v) {
      return v.value;
    }
    this.removeFromList(v);
    this.appendToList(v);
    return v.value;
  }

  set(key: K, value: V) {
    if (this.map.has(key)) {
      // remove old
      this.removeFromList(this.map.get(key)!);
    }
    const node: ILRUNode<K, V> = {key, value, prev: null, next: null};
    this.map.set(key, node);
    this.appendToList(node);


    while (this.map.size > this.maxSize) {
      // remove oldest = next of youngest
      const oldest = this.youngest!.next!;
      this.map.delete(oldest.key);
      this.removeFromList(oldest);
    }

    return this;
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  entries(): IterableIterator<[K, V]> {
    return new ListIterator<[K, V], K, V>(this.youngest, (v) => [v.key, v.value]);
  }

  keys(): IterableIterator<K> {
    return new ListIterator<K, K, V>(this.youngest, (v) => v.key);
  }

  values(): IterableIterator<V> {
    return new ListIterator<V, K, V>(this.youngest, (v) => v.value);
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any) {
    if (this.youngest === null) {
      return;
    }
    if (this.youngest.next === this.youngest) {
      // single
      callbackfn.call(thisArg, this.youngest.value, this.youngest.key, this);
      return;
    }
    const l = new ListIterator<ILRUNode<K, V>, K, V>(this.youngest, (d) => d);
    for (let v = l.next(); !v.done; v = l.next()) {
      callbackfn.call(thisArg, v.value.value, v.value.key, this);
    }
  }
}
