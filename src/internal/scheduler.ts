import {IAbortAblePromise, ABORTED, IAbortAblePromiseBase} from 'lineupengine';

/**
 * @internal
 */
export interface IPoorManIdleDeadline {
  didTimeout: boolean;
  timeRemaining(): number;
}

/**
 * helper since not part of the typings
 * @internal
 */
export interface IPoorManIdleCallback {
  requestIdleCallback(callback: (deadline: IPoorManIdleDeadline) => void, options?: {timeout: number}): number;

  clearIdleCallback(callbackId: number): void;
}

/**
 * @internal
 */
export interface ITask<T> {
  /**
   * external task id
   */
  id: string;
  /**
   * iterator for the incremental task, return null for another round
   */
  it: Iterator<T | PromiseLike<T> | null>;
  /**
   * function to the resolve the resulting promise
   */
  resolve(r: T | PromiseLike<T> | symbol): void;
  /**
   * the resulting promise
   */
  result: PromiseLike<T | symbol>;

  /**
   * aborts this task
   */
  abort: () => void;

  isAborted: boolean;
}

/**
 * iterator result for another round
 * @internal
 */
export const ANOTHER_ROUND = {
  value: null,
  done: false
};

/**
 * iterator for just one entry
 * @internal
 */
export function oneShotIterator<T>(calc: () => T): Iterator<T> {
  return {
    next: () => ({done: true, value: calc()})
  };
}


function thenFactory<T>(wrappee: PromiseLike<T>, abort: () => void, isAborted: () => boolean) {
  function then<TResult1 = T | symbol, TResult2 = never>(onfulfilled?: ((value: T | symbol) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): IAbortAblePromiseBase<TResult1 | TResult2> {
    const r = wrappee.then(onfulfilled, onrejected);
    return {
      then: <any>thenFactory(r, abort, isAborted),
      abort,
      isAborted
    };
  }
  return then;
}

/**
 * task scheduler for running tasks in idle callbacks
 * @internal
 */
export default class TaskScheduler {
  private tasks: ITask<any>[] = [];
  // idle callback id
  private taskId: number = -1;

  private runTasks = (deadline: IPoorManIdleDeadline) => {
    // while more tasks and not timed out
    while (this.tasks.length > 0 && (deadline.didTimeout || deadline.timeRemaining() > 0)) {
      const task = this.tasks.shift()!;

      let r = task.it.next();
      // call next till done or ran out of time
      while (!r.done && (deadline.didTimeout || deadline.timeRemaining() > 0)) {
        r = task.it.next();
      }

      if (r.done) {
        // resolve async
        requestAnimationFrame(() => task.resolve(r.value));
      } else {
        // reschedule again
        this.tasks.unshift(task);
      }
    }

    this.taskId = -1;
    this.reSchedule();
  }

  private reSchedule() {
    if (this.tasks.length === 0 || this.taskId > -1) {
      return;
    }

    const ww = (<IPoorManIdleCallback><any>self);
    if (ww.requestIdleCallback) {
      this.taskId = ww.requestIdleCallback(this.runTasks);
    } else {
      this.taskId = self.setTimeout(this.runTasks, 1);
    }
  }

  /**
   * pushes a task with multi hops using an iterator
   * @param id task id
   * @param it iterator to execute
   */
  pushMulti<T>(id: string, it: Iterator<T | PromiseLike<T> | null>, abortAble = true): IAbortAblePromise<T> {
    // abort task with the same id
    const abort = () => {
      const index = this.tasks.findIndex((d) => d.id === id);
      if (index < 0) {
        return; // too late or none
      }
      const task = this.tasks[index];
      this.tasks.splice(index, 1);

      task.isAborted = true;
      task.resolve(ABORTED);
    };

    {
      // abort existing
      const index = this.tasks.findIndex((d) => d.id === id);
      if (index >= 0) {
        const task = this.tasks[index];
        task.abort();
      }
    }

    let resolve: (value: T | symbol) => void;

    const p = new Promise<T | symbol>((r) => {
      // called during constructor
      resolve = r;
    });

    const task: ITask<T> = {
      id,
      it,
      result: p,
      abort,
      isAborted: false,
      resolve: resolve!
    };
    const isAborted = () => task.isAborted;

    this.tasks.push(task);

    this.reSchedule();

    const abortOrDummy = abortAble ? abort : () => undefined;
    const isAbortedOrDummy = abortAble ? isAborted : () => false;

    return {
      then: thenFactory(p, abortOrDummy, isAbortedOrDummy),
      abort: abortOrDummy,
      isAborted: isAbortedOrDummy
    };
  }

  /**
   * pushes a simple task
   * @param id task id
   * @param calc task function
   */
  push<T>(id: string, calc: () => T | PromiseLike<T>): IAbortAblePromise<T> {
    return this.pushMulti(id, oneShotIterator(calc));
  }

  /**
   * abort a task with the given id
   * @param id task id
   */
  abort(id: string) {
    const index = this.tasks.findIndex((d) => d.id === id);
    if (index < 0) {
      return false; // too late or none
    }
    const task = this.tasks[index];
    task.abort();
    return true;
  }

  abortAll(filter: (task: ITask<any>) => boolean) {
    const abort = this.tasks.filter(filter);
    if (abort.length === 0) {
      return;
    }
    this.tasks = this.tasks.filter((d) => !filter(d));
    for (const task of abort) {
      task.resolve(ABORTED);
      task.abort();
    }
  }

  clear() {
    if (this.taskId === -1) {
      return;
    }
    const ww = (<IPoorManIdleCallback><any>self);
    if (ww.requestIdleCallback) {
      ww.clearIdleCallback(this.taskId);
    } else {
      self.clearTimeout(this.taskId);
    }
    this.taskId = -1;

    this.tasks.splice(0, this.tasks.length).forEach((d) => {
      d.resolve(ABORTED);
      d.abort();
    });
  }
}
