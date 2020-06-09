import {MIN_LABEL_WIDTH} from '../constants';
import {Column, IArrayColumn, IDataRow, ICategoricalLikeColumn, isMapAbleColumn, DEFAULT_COLOR} from '../model';
import {hsl} from 'd3-color';
import {cssClass} from '../styles';
import {IRenderContext} from '.';
import {ISequence} from '../internal';

/** @internal */
export function noop() {
  // no op
}

export const noRenderer = {
  template: `<div></div>`,
  update: <() => void>noop
};

/** @internal */
export function setText<T extends Node>(node: T, text?: string): T {
  if (text === undefined) {
    return node;
  }
  //no performance boost if setting the text node directly
  //const textNode = <Text>node.firstChild;
  //if (textNode == null) {
  //  node.appendChild(node.ownerDocument!.createTextNode(text));
  //} else {
  //  textNode.data = text;
  //}
  if (node.textContent !== text) {
    node.textContent = text;
  }
  return node;
}

/**
 * for each item matching the selector execute the callback
 * @param node
 * @param selector
 * @param callback
 * @internal
 */
export function forEach<T extends Element>(node: Element, selector: string, callback: (d: T, i: number) => void) {
  (<T[]>Array.from(node.querySelectorAll(selector))).forEach(callback);
}

/** @internal */
export function forEachChild<T extends Element>(node: Element, callback: (d: T, i: number) => void) {
  (<T[]>Array.from(node.children)).forEach(callback);
}

/**
 * matches the columns and the dom nodes representing them
 * @param {HTMLElement} node row
 * @param columns columns to check
 * @internal
 */
export function matchColumns(node: HTMLElement, columns: {column: Column, template: string, rendererId: string}[], ctx: IRenderContext) {
  if (node.childElementCount === 0) {
    // initial call fast method
    node.innerHTML = columns.map((c) => c.template).join('');
    const children = Array.from(node.children);
    columns.forEach((col, i) => {
      const cnode = <HTMLElement>children[i];
      // set attribute for finding again
      cnode.dataset.columnId = col.column.id;
      // store current renderer
      cnode.dataset.renderer = col.rendererId;
      cnode.classList.add(cssClass(`renderer-${col.rendererId}`));
    });
    return;
  }

  function matches(c: {column: Column, rendererId: string}, i: number) {
    //do both match?
    const n = <HTMLElement>node.children[i];
    return n != null && n.dataset.columnId === c.column.id && n.dataset.renderer === c.rendererId;
  }

  if (columns.every(matches)) {
    return; //nothing to do
  }

  const idsAndRenderer = new Set(columns.map((c) => `${c.column.id}@${c.rendererId}`));
  //remove all that are not existing anymore
  forEachChild(node, (n: HTMLElement) => {
    const id = n.dataset.columnId;
    const renderer = n.dataset.renderer;
    const idAndRenderer = `${id}@${renderer}`;
    if (!idsAndRenderer.has(idAndRenderer)) {
      node.removeChild(n);
    }
  });
  columns.forEach((col) => {
    let cnode = <HTMLElement>node.querySelector(`[data-column-id="${col.column.id}"]`);
    if (!cnode) {
      cnode = ctx.asElement(col.template);
      cnode.dataset.columnId = col.column.id;
      cnode.dataset.renderer = col.rendererId;
      cnode.classList.add(cssClass(`renderer-${col.rendererId}`));
    }
    node.appendChild(cnode);
  });
}

export function wideEnough(col: IArrayColumn<any>, length: number = col.labels.length) {
  const w = col.getWidth();
  return w / length > MIN_LABEL_WIDTH; // at least 30 pixel
}

export function wideEnoughCat(col: ICategoricalLikeColumn) {
  const w = col.getWidth();
  return w / col.categories.length > MIN_LABEL_WIDTH; // at least 30 pixel
}



// side effect
const adaptColorCache: {[bg: string]: string} = {};
/**
 * Adapts the text color for a given background color
 * @param {string} bgColor as `#ff0000`
 * @returns {string} returns `black` or `white` for best contrast
 */
export function adaptTextColorToBgColor(bgColor: string): string {
  const bak = adaptColorCache[bgColor];
  if (bak) {
    return bak;
  }
  return adaptColorCache[bgColor] = hsl(bgColor).l > 0.5 ? 'black' : 'white';
}


/**
 *
 * Adapts the text color for a given background color
 * @param {HTMLElement} node the node containing the text
 * @param {string} bgColor as `#ff0000`
 * @param {string} title the title to render
 * @param {number} width for which percentages of the cell this background applies (0..1)
 */
export function adaptDynamicColorToBgColor(node: HTMLElement, bgColor: string, title: string, width: number) {
  const adapt = adaptTextColorToBgColor(bgColor);
  if ((width <= 0.05 || adapt === 'black') || width > 0.9) { // almost empty or full
    node.style.color = adapt === 'black' || width <= 0.05 ? null : adapt; // null = black
    // node.classList.remove('lu-gradient-text');
    // node.style.backgroundImage = null;
    return;
  }

  node.style.color = null;
  node.innerText = title;

  const span = node.ownerDocument!.createElement('span');
  span.classList.add(cssClass('gradient-text'));
  span.style.color = adapt;
  span.innerText = title;
  node.appendChild(span);
}


/** @internal */
export const uniqueId: (prefix: string) => string = (function () {
  // side effect but just within the function itself, so good for the library
  let idCounter = 0;
  return (prefix: string) => `${prefix}${(idCounter++).toString(36)}`;
})();


const NUM_EXAMPLE_VALUES = 5;

/** @internal */
export function exampleText(col: Column, rows: ISequence<IDataRow>) {
  const examples = <string[]>[];
  rows.every((row) => {
    if (col.getValue(row) == null) {
      return true;
    }
    const v = col.getLabel(row);
    examples.push(v);
    return examples.length < NUM_EXAMPLE_VALUES;
  });
  if (examples.length === 0) {
    return '';
  }
  return `${examples.join(', ')}${examples.length < rows.length ? ', ...' : ''}`;
}


/** @internal */
export function multiLevelGridCSSClass(idPrefix: string, column: Column) {
  return cssClass(`stacked-${idPrefix}-${column.id}`);
}


/** @internal */
export function colorOf(col: Column) {
  if (isMapAbleColumn(col)) {
    return col.getColorMapping().apply(0);
  }
  return DEFAULT_COLOR;
}
