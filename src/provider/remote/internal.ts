import {ICustomAbortSignal, ERemoteStatiticsType, IComputeColumn} from './interfaces';
import {IColumnDump} from '../../model';

export class CustomAbortSignal implements ICustomAbortSignal {
  onabort:(()=>void) | undefined = undefined;
  aborted: boolean = false;

  abort() {
    if (this.aborted) {
      return;
    }
    this.aborted = true;
    if (this.onabort) {
      this.onabort();
    }
  }
}


export class MultiAbortSignal extends CustomAbortSignal {
  private count: number = 0;

  constructor(private readonly ref: any[]) {
    super();
  }

  abort() {
    if (this.aborted) {
      return;
    }
    // just abort when all were aborted
    this.count += 1;
    if (this.count >= this.ref.length) {
      super.abort();
    }
  }
}


/**
 * @internal
 */
export interface IDebounceContext {
  promise: Promise<any[]>;
  cols: IComputeColumn[];
  timer: number;
  resolve: (r: Promise<any[]>) => void;
  signal: MultiAbortSignal;
}

/**
 * @internal
 */
export class CallDebouncer {
  private static readonly DEBOUNCE_DELAY = 100; // 100ms
  private readonly debounceKeys = new Map<string, IDebounceContext>();

  debouncedCall<T>(key: string, dump: IColumnDump, type: ERemoteStatiticsType, f: (cols: IComputeColumn[], signal: ICustomAbortSignal) => Promise<T[]>): {data: Promise<T>, signal: {abort(): void}} {
    if (!this.debounceKeys.has(key)) {
      const cols = [{dump, type}];
      const signal = new MultiAbortSignal(cols);
      let resolve: (r: Promise<T[]>) => void = () => undefined;
      const promise = new Promise<T[]>((resolveImpl) => resolve = resolveImpl);
      const timer = self.setTimeout(() => {
        this.debounceKeys.delete(key);
        resolve(f(cols, signal));
      }, CallDebouncer.DEBOUNCE_DELAY);
      this.debounceKeys.set(key, {promise, resolve, timer, cols, signal});
      return {data: promise.then((r) => r[0]), signal};
    }

    // update the timer and push another column to the arguments
    const entry = this.debounceKeys.get(key)!;

    const index = entry.cols.length;
    entry.cols.push({dump, type});

    clearTimeout(entry.timer);
    entry.timer = self.setTimeout(() => {
      this.debounceKeys.delete(key);
      entry.resolve(f(entry.cols, entry.signal));
    }, CallDebouncer.DEBOUNCE_DELAY);

    return {data: entry.promise.then((r) => r[index]), signal: entry.signal};
  }
}
