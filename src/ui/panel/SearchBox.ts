import { clear, AEventDispatcher, IEventListener } from '../../internal';
import { cssClass } from '../../styles';

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
    placeholder: 'Select...',
  };

  readonly node: HTMLElement;
  private search: HTMLInputElement;
  private body: HTMLElement;

  private readonly itemTemplate: HTMLElement;
  private readonly groupTemplate: HTMLElement;

  private values: (T | IGroupSearchItem<T>)[] = [];

  constructor(options: Partial<ISearchBoxOptions<T>> = {}) {
    super();
    Object.assign(this.options, options);

    this.node = this.options.doc.createElement('div');
    this.node.classList.add(cssClass('search'));
    this.node.innerHTML = `<input class="${cssClass('search-input')}" type="search" placeholder="${
      this.options.placeholder
    }">
    <ul class="${cssClass('search-list')}"></ul>`;

    this.search = <HTMLInputElement>this.node.firstElementChild!;
    this.body = <HTMLElement>this.node.lastElementChild!;

    this.search.onfocus = () => this.focus();
    this.search.onblur = () => this.blur();
    this.search.oninput = () => this.filter();
    this.search.onkeydown = (evt) => this.handleKey(evt);

    this.itemTemplate = this.options.doc.createElement('li');
    this.itemTemplate.classList.add(cssClass('search-item'));
    this.itemTemplate.innerHTML = `<span></span>`;
    this.groupTemplate = this.options.doc.createElement('li');
    this.groupTemplate.classList.add(cssClass('search-group'));
    this.groupTemplate.innerHTML = `<span></span><ul></ul>`;
  }

  get data() {
    return this.values;
  }

  set data(data: (T | IGroupSearchItem<T>)[]) {
    this.values = data;
    clear(this.body);
    this.buildDialog(this.body, this.values);
  }

  private buildDialog(node: HTMLElement, values: (T | IGroupSearchItem<T>)[]) {
    for (const v of values) {
      let li: HTMLElement;
      if (isItem(v)) {
        li = <HTMLElement>this.itemTemplate.cloneNode(true);
        li.onmousedown = (evt) => {
          // see https://stackoverflow.com/questions/10652852/jquery-fire-click-before-blur-event#10653160
          evt.preventDefault();
        };
        li.onclick = () => this.select(v);
        li.onmouseenter = () => (this.highlighted = li);
        li.onmouseleave = () => (this.highlighted = null);
        node.appendChild(li);
      } else {
        li = <HTMLElement>this.groupTemplate.cloneNode(true);
        this.buildDialog(<HTMLElement>li.lastElementChild!, v.children);
        node.appendChild(li);
      }
      const item = <HTMLElement>li.firstElementChild!;
      item.innerHTML = this.options.formatItem(v, item);
    }
  }

  private handleKey(evt: KeyboardEvent) {
    const KEYS = {
      ESC: 27,
      ENTER: 13,
      UP: 38,
      DOWN: 40,
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
    this.fire(SearchBox.EVENT_SELECT, item);
  }

  focus() {
    this.body.style.width = `${this.search.offsetWidth}px`;
    this.highlighted = <HTMLElement>this.body.firstElementChild || null;
    this.node.classList.add(cssClass('search-open'));
  }

  private get highlighted() {
    return <HTMLElement>this.body.getElementsByClassName(cssClass('search-highlighted'))[0] || null;
  }

  private set highlighted(value: HTMLElement | null) {
    const old = this.highlighted;
    if (old === value) {
      return;
    }
    if (old) {
      old.classList.remove(cssClass('search-highlighted'));
    }
    if (value) {
      value.classList.add(cssClass('search-highlighted'));
    }
  }

  private highlightNext() {
    const h = this.highlighted;
    if (!h || h.classList.contains(cssClass('hidden'))) {
      this.highlighted =
        <HTMLElement>this.body.querySelector(`.${cssClass('search-item')}:not(.${cssClass('hidden')})`) || null;
      return;
    }

    const items = <HTMLElement[]>(
      Array.from(this.body.querySelectorAll(`.${cssClass('search-item')}:not(.${cssClass('hidden')})`))
    );
    const index = items.indexOf(h);
    this.highlighted = items[index + 1] || null;
  }

  private highlightPrevious() {
    const h = this.highlighted;
    const items = <HTMLElement[]>(
      Array.from(this.body.querySelectorAll(`.${cssClass('search-item')}:not(.${cssClass('hidden')})`))
    );

    if (!h || h.classList.contains(cssClass('hidden'))) {
      this.highlighted = items[items.length - 1] || null;
      return;
    }
    const index = items.indexOf(h);
    this.highlighted = items[index - 1] || null;
  }

  private blur() {
    this.search.value = '';
    // clear filter
    this.filterResults(this.body, '');
    this.node.classList.remove(cssClass('search-open'));
  }

  private filter() {
    const empty = this.filterResults(this.body, this.search.value.toLowerCase());
    this.body.classList.toggle(cssClass('search-empty'), empty);
  }

  private filterResults(node: HTMLElement, text: string) {
    if (text === '') {
      // show all
      (<HTMLElement[]>Array.from(node.getElementsByClassName(cssClass('hidden')))).forEach((d: HTMLElement) =>
        d.classList.remove(cssClass('hidden'))
      );
      return false;
    }
    const children = Array.from(node.children);
    children.forEach((d) => {
      const content = d.firstElementChild!.innerHTML.toLowerCase();
      let hidden = !content.includes(text);
      if (d.classList.contains(cssClass('search-group'))) {
        const ul = <HTMLElement>d.lastElementChild!;
        const allChildrenHidden = this.filterResults(ul, text);
        hidden = hidden && allChildrenHidden;
      }
      d.classList.toggle(cssClass('hidden'), hidden);
    });

    return children.every((d) => d.classList.contains(cssClass('hidden')));
  }

  protected createEventList() {
    return super.createEventList().concat([SearchBox.EVENT_SELECT]);
  }

  on(type: typeof SearchBox.EVENT_SELECT, listener: typeof select | null): this;
  on(type: string | string[], listener: IEventListener | null): this; // required for correct typings in *.d.ts
  on(type: string | string[], listener: IEventListener | null): this {
    return super.on(type, listener);
  }
}
