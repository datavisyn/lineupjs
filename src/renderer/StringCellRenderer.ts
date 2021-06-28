import { StringColumn, Column, IDataRow, IOrderedGroup, IStringFilter } from '../model';
import { filterMissingMarkup, findFilterMissing } from '../ui/missing';
import type {
  IRenderContext,
  ICellRendererFactory,
  ISummaryRenderer,
  IGroupCellRenderer,
  ICellRenderer,
} from './interfaces';
import { renderMissingDOM } from './missing';
import { setText, exampleText } from './utils';
import { cssClass } from '../styles';
import { debounce } from '../internal';

/**
 * renders a string with additional alignment behavior
 * one instance factory shared among strings
 */
export default class StringCellRenderer implements ICellRendererFactory {
  readonly title: string = 'Default';

  canRender(col: Column): boolean {
    return col instanceof StringColumn;
  }

  create(col: StringColumn): ICellRenderer {
    const align = col.alignment || 'left';
    return {
      template: `<div${align !== 'left' ? ` class="${cssClass(align)}"` : ''}> </div>`,
      update: (n: HTMLDivElement, d: IDataRow) => {
        renderMissingDOM(n, col, d);
        if (col.escape) {
          setText(n, col.getLabel(d));
        } else {
          n.innerHTML = col.getLabel(d);
        }
        n.title = n.textContent!;
      },
    };
  }

  createGroup(col: StringColumn, context: IRenderContext): IGroupCellRenderer {
    return {
      template: `<div> </div>`,
      update: (n: HTMLDivElement, group: IOrderedGroup) => {
        return context.tasks
          .groupExampleRows(col, group, 'string', (rows) => exampleText(col, rows))
          .then((text) => {
            if (typeof text === 'symbol') {
              return;
            }
            n.classList.toggle(cssClass('missing'), !text);
            if (col.escape) {
              setText(n, text);
            } else {
              n.innerHTML = text;
              n.title = text;
            }
          });
      },
    };
  }

  private static interactiveSummary(col: StringColumn, node: HTMLElement) {
    const form = node as HTMLFormElement;
    const filterMissing = findFilterMissing(node);
    const input = node.querySelector<HTMLInputElement>('input[type="text"]');
    const isRegex = node.querySelector<HTMLInputElement>('input[type="checkbox"]');

    const update = () => {
      const valid = input.value.trim();
      if (valid.length <= 0) {
        const filter = filterMissing.checked ? { filter: null, filterMissing: filterMissing.checked } : null;
        col.setFilter(filter);
        return;
      }
      col.setFilter({
        filter: isRegex.checked ? new RegExp(input.value) : input.value,
        filterMissing: filterMissing.checked,
      });
    };

    filterMissing.onchange = update;
    input.onchange = update;
    input.oninput = debounce(update, 100);
    isRegex.onchange = update;
    form.onsubmit = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      update();
      return false;
    };

    return (actCol: StringColumn) => {
      col = actCol;
      const f = col.getFilter() || { filter: null, filterMissing: false };
      const bak = f.filter;
      filterMissing.checked = f.filterMissing;
      input.value = bak instanceof RegExp ? bak.source : bak || '';
      isRegex.checked = bak instanceof RegExp;
    };
  }

  createSummary(col: StringColumn, context: IRenderContext, interactive: boolean): ISummaryRenderer {
    if (!interactive) {
      return {
        template: `<div></div>`,
        update: (node: HTMLElement) => {
          const filter = col.getFilter();
          node.textContent = filterToString(filter);
        },
      };
    }
    const f = col.getFilter() || { filter: null, filterMissing: false };
    const bak = f.filter || '';
    let update: (col: StringColumn) => void;
    return {
      template: `<form><input type="text" placeholder="Filter ${col.desc.label}..." autofocus
      list="${context.idPrefix}${col.id}_dl" value="${filterToString(f)}">
          <label class="${cssClass('checkbox')}">
            <input type="checkbox" ${bak instanceof RegExp ? 'checked="checked"' : ''}>
            <span>Use regular expressions</span>
          </label>
          ${filterMissingMarkup(f.filterMissing)}
          <datalist id="${context.idPrefix}${col.id}_dl"></datalist></form>`,
      update: (node: HTMLElement) => {
        if (!update) {
          update = StringCellRenderer.interactiveSummary(col, node);
        }
        update(col);
        const dl = node.querySelector('datalist')!;

        // no return here = loading indicator since it won't affect the rendering
        void context.tasks.summaryStringStats(col).then((r) => {
          if (typeof r === 'symbol') {
            return;
          }
          const { summary } = r;
          matchDataList(dl, summary.topN);
        });
      },
    };
  }
}

/**
 * @internal
 */
export function filterToString(filter: IStringFilter | null) {
  if (filter == null || !filter.filter) {
    return '';
  }
  if (filter.filter instanceof RegExp) {
    return filter.filter.source;
  }
  return filter.filter;
}

/**
 * matches the given stats to a datalist
 * @internal
 */
export function matchDataList(node: HTMLDataListElement, matches: readonly { value: string; count: number }[]) {
  const children = Array.from(node.options);
  // update existing
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    let child = children[i];
    if (!child) {
      child = node.ownerDocument.createElement('option');
      node.appendChild(child);
    }
    child.value = m.value;
    if (m.count > 1) {
      setText(child, `${m.value} (${m.count.toLocaleString()})`);
    }
  }
  // remove extra
  for (let i = children.length - 1; i >= matches.length; i--) {
    children[i].remove();
  }
}
