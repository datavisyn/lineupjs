import type {
  IWorkerMessage,
  INumberStatsMessageRequest,
  IAdvancedBoxPlotData,
  ICategoricalStatistics,
  IDateStatistics,
  IStatistics,
  ICategoricalStatsMessageRequest,
  IDateStatsMessageRequest,
  IBoxPlotStatsMessageRequest,
} from './';
import type { UIntTypedArray, IndicesArray } from '../model';
import type { IStringStatsMessageRequest } from './math';
import type { IStringStatistics } from './mathInterfaces';

/**
 * @internal
 */
export interface IPoorManWorkerScopeEventMap {
  message: MessageEvent;
  error: ErrorEvent;
}

declare type IPoorManTransferAble = ArrayBuffer | MessagePort | ImageBitmap;

/**
 * @internal
 */
export interface IPoorManWorkerScope {
  onmessage: ((this: IPoorManWorkerScope, ev: MessageEvent) => any) | null;
  onerror: ((this: IPoorManWorkerScope, ev: ErrorEvent) => any) | null;
  close(): void;
  postMessage(message: any, transfer?: IPoorManTransferAble[]): void;
  addEventListener<K extends keyof IPoorManWorkerScopeEventMap>(
    type: K,
    listener: (this: IPoorManWorkerScope, ev: IPoorManWorkerScopeEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener<K extends keyof IPoorManWorkerScopeEventMap>(
    type: K,
    listener: (this: IPoorManWorkerScope, ev: IPoorManWorkerScopeEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;
}

// function workerMain(self: IPoorManWorkerScope) {
//   self.addEventListener('message', (evt) => {
//     self.postMessage(`Worker: ${evt.data} - Polo`);
//   });
// }

/**
 * @internal
 */
export function toFunctionBody(f: () => any) {
  const source = f.toString();
  return source.slice(source.indexOf('{') + 1, source.lastIndexOf('}'));
}

/**
 * create a blob out of the given function or string
 * @internal
 */
export function createWorkerCodeBlob(fs: (string | (() => any))[]) {
  const sources = fs.map((d) => d.toString()).join('\n\n');

  const blob = new Blob([sources], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

const MIN_WORKER_THREADS = 1;
const MAX_WORKER_THREADS = Math.max(navigator.hardwareConcurrency - 1, 1); // keep one for the ui

const THREAD_CLEANUP_TIME = 10000; // 10s

interface ITaskWorker {
  /**
   * worker index
   */
  index: number;
  /**
   * worker itself
   */
  worker: Worker;
  /**
   * set of active task numbers
   */
  tasks: Set<number>;
  /**
   * list of references that are stored on this worker
   */
  refs: Set<string>;
}

/**
 * task scheduler based on web worker
 * @internal
 */
export class WorkerTaskScheduler {
  private readonly workers: ITaskWorker[] = [];
  private cleanUpWorkerTimer = -1;
  /**
   * worker task id
   */
  private workerTaskCounter = 0;

  constructor(private readonly blob: string) {
    for (let i = 0; i < MIN_WORKER_THREADS; ++i) {
      const w = new Worker(blob);
      this.workers.push({ worker: w, tasks: new Set(), refs: new Set(), index: i });
    }
  }

  terminate() {
    this.workers.splice(0, this.workers.length).forEach((w) => w.worker.terminate());
  }

  private readonly cleanUpWorker = () => {
    // delete workers when they are not needed anymore and empty
    while (this.workers.length > MIN_WORKER_THREADS) {
      const toFree = this.workers.findIndex((d) => d.tasks.size === 0);
      if (toFree < 0) {
        break;
      }
      const w = this.workers.splice(toFree, 1)[0]!;
      w.worker.terminate();
    }
    // maybe reschedule
    this.finishedTask();
  };

  private checkOutWorker() {
    if (this.cleanUpWorkerTimer >= 0) {
      clearTimeout(this.cleanUpWorkerTimer);
      this.cleanUpWorkerTimer = -1;
    }

    const emptyWorker = this.workers.find((d) => d.tasks.size === 0);

    if (emptyWorker) {
      return emptyWorker;
    }

    if (this.workers.length >= MAX_WORKER_THREADS) {
      // find the one with the fewest tasks
      return this.workers.reduce(
        (a, b) => (a == null || a.tasks.size > b.tasks.size ? b : a),
        null as ITaskWorker | null
      )!;
    }

    // create new one
    const r: ITaskWorker = {
      worker: new Worker(this.blob),
      tasks: new Set<number>(),
      refs: new Set(),
      index: this.workers.length,
    };
    this.workers.push(r);
    return r;
  }

  private finishedTask() {
    if (this.cleanUpWorkerTimer === -1 && this.workers.length > MIN_WORKER_THREADS) {
      this.cleanUpWorkerTimer = setTimeout(this.cleanUpWorker, THREAD_CLEANUP_TIME) as unknown as number;
    }
  }

  pushStats(
    type: 'numberStats',
    args: Partial<INumberStatsMessageRequest>,
    refData: string,
    data: Float32Array,
    refIndices?: string,
    indices?: IndicesArray
  ): Promise<IStatistics>;
  pushStats(
    type: 'boxplotStats',
    args: Partial<IBoxPlotStatsMessageRequest>,
    refData: string,
    data: Float32Array,
    refIndices?: string,
    indices?: IndicesArray
  ): Promise<IAdvancedBoxPlotData>;
  pushStats(
    type: 'categoricalStats',
    args: Partial<ICategoricalStatsMessageRequest>,
    refData: string,
    data: UIntTypedArray,
    refIndices?: string,
    indices?: IndicesArray
  ): Promise<ICategoricalStatistics>;
  pushStats(
    type: 'dateStats',
    args: Partial<IDateStatsMessageRequest>,
    refData: string,
    data: Float64Array,
    refIndices?: string,
    indices?: IndicesArray
  ): Promise<IDateStatistics>;
  pushStats(
    type: 'stringStats',
    args: Partial<IStringStatsMessageRequest>,
    refData: string,
    data: readonly string[],
    refIndices?: string,
    indices?: IndicesArray
  ): Promise<IStringStatistics>;
  pushStats(
    type: 'numberStats' | 'boxplotStats' | 'categoricalStats' | 'dateStats' | 'stringStats',
    args: any,
    refData: string,
    data: Float32Array | UIntTypedArray | Float64Array | readonly string[],
    refIndices?: string,
    indices?: IndicesArray
  ) {
    return new Promise((resolve) => {
      const uid = this.workerTaskCounter++;
      const { worker, tasks, refs } = this.checkOutWorker();

      const receiver = (msg: MessageEvent) => {
        const r = msg.data as IWorkerMessage;
        if (r.uid !== uid || r.type !== type) {
          return;
        }
        // console.log('worker', index, uid, 'finish', r);
        worker.removeEventListener('message', receiver);
        tasks.delete(uid);
        this.finishedTask();
        resolve((r as any).stats);
      };

      worker.addEventListener('message', receiver);

      tasks.add(uid);

      const msg: any = Object.assign(
        {
          type,
          uid,
          refData,
          refIndices: refIndices || null,
        },
        args
      );

      if (!refData || !refs.has(refData)) {
        // need to transfer to worker
        msg.data = data;
        if (refData) {
          // save that this worker has this ref
          refs.add(refData);
        }
        // console.log(index, 'set ref (i)', refData);
      }
      if (indices && (!refIndices || !refs.has(refIndices))) {
        // need to transfer
        msg.indices = indices!;
        if (refIndices) {
          refs.add(refIndices);
        }
        // console.log(index, 'set ref (i)', refIndices);
      }
      // console.log('worker', index, uid, msg);

      worker.postMessage(msg);
    });
  }

  push<M, R>(type: string, args: M, transferAbles: ArrayBuffer[]): Promise<R>;
  push<M, R, T>(type: string, args: M, transferAbles: ArrayBuffer[], toResult: (r: R) => T): Promise<T>;
  push<M, R, T>(type: string, args: M, transferAbles: ArrayBuffer[], toResult?: (r: R) => T): Promise<T> {
    return new Promise<T>((resolve) => {
      const uid = this.workerTaskCounter++;
      const { worker, tasks } = this.checkOutWorker();

      const receiver = (msg: MessageEvent) => {
        const r = msg.data as IWorkerMessage;
        if (r.uid !== uid || r.type !== type) {
          return;
        }
        // console.log('worker', index, uid, 'finish', r);
        worker.removeEventListener('message', receiver);
        tasks.delete(uid);
        this.finishedTask();
        resolve(toResult ? toResult(r as any) : (r as any));
      };

      worker.addEventListener('message', receiver);
      tasks.add(uid);
      const msg = Object.assign(
        {
          type,
          uid,
        },
        args
      );
      // console.log('worker', index, uid, msg);

      worker.postMessage(msg, transferAbles);
    });
  }

  setRef(ref: string, data: Float32Array | UIntTypedArray | Int32Array | Float64Array | IndicesArray) {
    for (const w of this.workers) {
      w.refs.add(ref);
    }
    this.broadCast('setRef', {
      ref,
      data,
    });
  }

  deleteRef(ref: string, startsWith = false) {
    const uid = this.workerTaskCounter++;
    const msg = {
      type: 'deleteRef',
      uid,
      ref,
      startsWith,
    };
    for (const w of this.workers) {
      // console.log(w.index, 'delete ref', ref, startsWith);
      w.worker.postMessage(msg);
      if (!startsWith) {
        w.refs.delete(ref);
        continue;
      }
      for (const r of Array.from(w.refs)) {
        if (r.startsWith(ref)) {
          w.refs.delete(r);
        }
      }
    }
  }

  deleteRefs() {
    const uid = this.workerTaskCounter++;
    const msg = {
      type: 'deleteRef',
      uid,
      ref: '',
      startsWith: true,
    };
    for (const w of this.workers) {
      // console.log(w.index, 'delete refs');
      w.worker.postMessage(msg);
      w.refs.clear();
    }
  }

  broadCast<T>(type: string, args: T) {
    const uid = this.workerTaskCounter++;
    // don't store in tasks queue since there is no response
    const msg = Object.assign(
      {
        type,
        uid,
      },
      args
    );
    // console.log('broadcast', msg);
    for (const w of this.workers) {
      w.worker.postMessage(msg);
    }
  }
}
