import Popper from 'popper.js';
import DialogManager from './DialogManager';
import {merge} from '../../internal';
import {cssClass} from '../../styles';
import {IRankingHeaderContext} from '../interfaces';
import {ILivePreviewOptions} from '../../config';

export interface IDialogOptions {
  title: string;
  livePreview: boolean | keyof ILivePreviewOptions;
  popup: boolean;
  // popper options
  placement?: Popper.Placement;
  eventsEnabled?: boolean;
  modifiers?: Popper.Modifiers;
  toggleDialog: boolean;
  cancelSubDialogs?: boolean;
  autoClose?: boolean;
}

export interface IDialogContext {
  attachment: HTMLElement;
  level: number;
  manager: DialogManager;
  idPrefix: string;
}

export function dialogContext(ctx: IRankingHeaderContext, level: number, attachment: HTMLElement | MouseEvent): IDialogContext {
  return {
    attachment: (<MouseEvent>attachment).currentTarget != null ? <HTMLElement>(<MouseEvent>attachment).currentTarget : <HTMLElement>attachment,
    level,
    manager: ctx.dialogManager,
    idPrefix: ctx.idPrefix
  };
}

abstract class ADialog {

  private readonly options: Readonly<IDialogOptions> = {
    title: '',
    livePreview: false,
    popup: false,
    placement: 'bottom-start',
    toggleDialog: true,
    cancelSubDialogs: false,
    autoClose: false,
    modifiers: {
    }
  };

  readonly node: HTMLFormElement;
  private popper: Popper | null = null;

  constructor(protected readonly dialog: Readonly<IDialogContext>, options: Partial<IDialogOptions> = {}) {
    Object.assign(this.options, options);
    this.node = dialog.attachment.ownerDocument!.createElement('form');
    this.node.classList.add(cssClass('dialog'));
  }

  get autoClose() {
    return this.options.autoClose;
  }

  get attachment() {
    return this.dialog.attachment;
  }

  get level() {
    return this.dialog.level;
  }

  protected abstract build(node: HTMLElement): boolean | void;

  protected showLivePreviews() {
    return this.options.livePreview === true || (typeof this.options.livePreview === 'string' && this.dialog.manager.livePreviews[this.options.livePreview] === true);
  }

  protected enableLivePreviews(selector: string | (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]) {
    if (!this.showLivePreviews()) {
      return;
    }
    const submitter = () => {
      this.submit();
    };
    if (typeof selector === 'string') {
      this.forEach(selector, (n: HTMLInputElement | HTMLSelectElement) => {
        n.addEventListener('change', submitter, {passive: true});
      });
    } else {
      selector.forEach((n) => {
        n.addEventListener('change', submitter, {passive: true});
      });
    }
  }

  equals(that: ADialog) {
    return this.dialog.level === that.dialog.level && this.dialog.attachment === that.dialog.attachment;
  }

  protected appendDialogButtons() {
    this.node.insertAdjacentHTML('beforeend', `<div class="${cssClass('dialog-buttons')}">
      <button class="${cssClass('dialog-button')}" type="submit" title="Apply"></button>
      <button class="${cssClass('dialog-button')}" type="button" title="Cancel"></button>
      <button class="${cssClass('dialog-button')}" type="reset" title="Reset to default values"></button>
    </div>`);
  }

  open() {
    if (this.options.toggleDialog && this.dialog.manager.removeLike(this)) {
      return;
    }
    if (this.build(this.node) === false) {
      return;
    }
    const parent = <HTMLElement>this.attachment.closest(`.${cssClass()}`)!;

    if (this.options.title) {
      this.node.insertAdjacentHTML('afterbegin', `<strong>${this.options.title}</strong>`);
    }
    if (!this.options.popup) {
      this.appendDialogButtons();
    }

    parent.appendChild(this.node);
    this.popper = new Popper(this.attachment, this.node, merge({
      modifiers: {
        preventOverflow: {
          boundariesElement: parent
        }
      }
    }, this.options));

    const auto = this.find<HTMLInputElement>('input[autofocus]');
    if (auto) {
      // delay such that it works
      self.setTimeout(() => auto.focus());
    }

    const reset = this.find<HTMLButtonElement>('button[type=reset]');
    if (reset) {
      reset.onclick = (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        this.reset();
        if (this.showLivePreviews()) {
          this.submit();
        }
      };
    }
    this.node.onsubmit = (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      return this.triggerSubmit();
    };
    const cancel = this.find<HTMLButtonElement>('button[title=Cancel]');
    if (cancel) {
      cancel.onclick = (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        this.cancel();
        this.destroy('cancel');
      };
    }

    if (this.options.cancelSubDialogs) {
      this.node.addEventListener('click', () => {
        this.dialog.manager.removeAboveLevel(this.dialog.level + 1);
      });
    }

    this.dialog.manager.push(this);
  }

  protected triggerSubmit() {
    if (!this.node.checkValidity()) {
      return false;
    }
    if (this.submit() !== false) {
      this.destroy('confirm');
    }
    return false;
  }

  protected find<T extends HTMLElement>(selector: string): T {
    return <T>this.node.querySelector(selector);
  }

  protected findInput(selector: string) {
    return this.find<HTMLInputElement>(selector);
  }

  protected forEach<M extends Element, T>(selector: string, callback: (d: M, i: number) => T): T[] {
    return (<M[]>Array.from(this.node.querySelectorAll(selector))).map(callback);
  }

  protected abstract reset(): void;

  protected abstract submit(): boolean | undefined;

  protected abstract cancel(): void;

  cleanUp(action: 'cancel' | 'confirm' | 'handled') {
    if (action === 'confirm') {
      this.submit(); // TODO what if submit wasn't successful?
    } else if (action === 'cancel') {
      this.cancel();
    }

    if (action !== 'handled') {
      this.dialog.manager.triggerDialogClosed(this, action);
    }

    if (this.popper) {
      this.popper.destroy();
    }
    this.node.remove();
  }

  protected destroy(action: 'cancel' | 'confirm' = 'cancel') {
    this.dialog.manager.triggerDialogClosed(this, action);
    this.dialog.manager.remove(this, true);
  }
}

export default ADialog;
