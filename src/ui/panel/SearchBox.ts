import AEventDispatcher from '../../internal/AEventDispatcher';
import {IEventListener} from '../../internal/AEventDispatcher';

export interface IItem {
  id: string;
  text: string;
}

export interface IGroupSearchItem<T extends IItem> {
  text: string;
  children: (T | IGroupSearchItem<T>)[];
}

function isItem<T extends IItem>(v: T | IGroupSearchItem<T>): v is T {
  return (<T>v).id !== undefined;
}

export interface ISearchBoxOptions<T extends IItem> {
  doc: Document;

  formatItem(item: T | IGroupSearchItem<T>, node: HTMLElement): string;

  placeholder: string;
}

/**
 * @asMemberOf SearchBox
 * @event
 */
export declare function select(item: any): void;


export default class SearchBox<T extends IItem> extends AEventDispatcher {
  static readonly EVENT_SELECT = 'select';

  private readonly options: Readonly<ISearchBoxOptions<T>> = {
    formatItem: (item) => item.text,
    doc: document,
    placeholder: 'Select...'
  };

  readonly node: HTMLElement;
  private search: HTMLInputElement;
  private body: HTMLElement;

  private values: (T | IGroupSearchItem<T>)[] = [];

  constructor(options: Partial<ISearchBoxOptions<T>> = {}) {
    super();
    Object.assign(this.options, options);

    this.node = this.options.doc.createElement('div');
    this.node.classList.add('lu-search');
    this.node.innerHTML = `<input type="search" placeholder="${this.options.placeholder}"><ul></ul>`;

    this.search = this.node.querySelector('input')!;
    this.body = this.node.querySelector('ul')!;

    this.search.onfocus = () => this.focus();
    this.search.onblur = () => this.blur();
    this.search.oninput = () => this.filter();
    this.search.onkeydown = (evt) => this.handleKey(evt);
  }

  get data() {
    return this.values;
  }

  set data(data: (T | IGroupSearchItem<T>)[]) {
    this.values = data;
    this.body.innerHTML = '';
    this.buildDialog(this.body, this.values);
  }

  private buildDialog(node: HTMLElement, values: (T | IGroupSearchItem<T>)[]) {
    values.forEach((v) => {
      if (isItem(v)) {
        node.insertAdjacentHTML('beforeend', `<li class="lu-search-item"><span></span></li>`);
        const span = (<HTMLElement>node.lastElementChild!);
        span.onmousedown = (evt) => {
          // see https://stackoverflow.com/questions/10652852/jquery-fire-click-before-blur-event#10653160
          evt.preventDefault();
        };
        span.onclick = () => this.select(v);
        span.onmouseenter = () => this.highlighted = span;
        span.onmouseleave = () => this.highlighted = null;
      } else {
        node.insertAdjacentHTML('beforeend', `<li class="lu-search-group"><span></span><ul></ul></li>`);
        const ul = <HTMLElement>node.lastElementChild!.lastElementChild!;
        this.buildDialog(ul, v.children);
      }
      const item = <HTMLElement>node.lastElementChild!.firstElementChild!;
      item.innerHTML = this.options.formatItem(v, item);
    });
  }

  private handleKey(evt: KeyboardEvent) {
    const KEYS = {
      ESC: 27,
      ENTER: 13,
      UP: 38,
      DOWN: 40
    };
    switch (evt.which) {
      case KEYS.ESC:
        this.search.blur();
        break;
      case KEYS.ENTER:
        const h = this.highlighted;
        if (h) {
          h.click();
        }
        break;
      case KEYS.UP:
        this.highlightPrevious();
        break;
      case KEYS.DOWN:
        this.highlightNext();
        break;
    }
  }

  private select(item: T) {
    this.search.value = ''; // reset
    this.search.blur();
    this.filterResults(this.body, '');
    this.fire(SearchBox.EVENT_SELECT, item);
  }

  focus() {
    this.body.style.width = `${this.search.offsetWidth}px`;
    this.highlighted = <HTMLElement>this.body.firstElementChild || null;
    this.node.classList.add('lu-search-open');
  }

  private get highlighted() {
    return <HTMLElement>this.body.querySelector('.lu-search-highlighted') || null;
  }

  private set highlighted(value: HTMLElement | null) {
    const old = this.highlighted;
    if (old === value) {
      return;
    }
    if (old) {
      old.classList.remove('lu-search-highlighted');
    }
    if (value) {
      value.classList.add('lu-search-highlighted');
    }
  }

  private highlightNext() {
    const h = this.highlighted;
    if (!h || h.classList.contains('hidden')) {
      this.highlighted = <HTMLElement>this.body.querySelector('.lu-search-item:not(.hidden)') || null;
      return;
    }

    const items = <HTMLElement[]>Array.from(this.body.querySelectorAll('.lu-search-item:not(.hidden)'));
    const index = items.indexOf(h);
    this.highlighted = items[index + 1] || null;
  }

  private highlightPrevious() {
    const h = this.highlighted;
    const items = <HTMLElement[]>Array.from(this.body.querySelectorAll('.lu-search-item:not(.hidden)'));

    if (!h || h.classList.contains('hidden')) {
      this.highlighted = items[items.length - 1] || null;
      return;
    }
    const index = items.indexOf(h);
    this.highlighted = items[index - 1] || null;
  }

  private blur() {
    this.search.value = '';
    this.node.classList.remove('lu-search-open');
  }

  private filter() {
    const empty = this.filterResults(this.body, this.search.value.toLowerCase());
    this.body.classList.toggle('lu-search-empty', empty);
  }

  private filterResults(node: HTMLElement, text: string) {
    if (text === '') {
      // show all
      (<HTMLElement[]>Array.from(node.querySelectorAll('.hidden'))).forEach((d: HTMLElement) => d.classList.remove('hidden'));
      return false;
    }
    const children = Array.from(node.children);
    children.forEach((d) => {
      const content = d.firstElementChild!.innerHTML.toLowerCase();
      let hidden = !content.includes(text);
      if (d.classList.contains('lu-search-group')) {
        const ul = <HTMLElement>d.lastElementChild!;
        const allChildrenHidden = this.filterResults(ul, text);
        hidden = hidden && allChildrenHidden;
      }
      d.classList.toggle('hidden', hidden);
    });

    return children.every((d) => d.classList.contains('hidden'));
  }

  protected createEventList() {
    return super.createEventList().concat([SearchBox.EVENT_SELECT]);
  }

  on(type: typeof SearchBox.EVENT_SELECT, listener: typeof select | null): this;
  on(type: string | string[], listener: IEventListener | null): this {
    return super.on(type, listener);
  }
}
