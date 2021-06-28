import type { StringColumn, IStringFilter } from '../../model';
import { filterMissingMarkup, findFilterMissing } from '../missing';
import ADialog, { IDialogContext } from './ADialog';
import { cssClass } from '../../styles';
import { debounce } from '../../internal';
import type { IRankingHeaderContext } from '../interfaces';
import { filterToString, matchDataList } from '../../renderer/StringCellRenderer';

function toInput(text: string, isRegex: boolean) {
  const v = text.trim();
  if (v === '') {
    return null;
  }
  return isRegex ? new RegExp(v, 'm') : v;
}

/** @internal */
export default class StringFilterDialog extends ADialog {
  private readonly before: IStringFilter | null;

  constructor(
    private readonly column: StringColumn,
    dialog: IDialogContext,
    private readonly ctx: IRankingHeaderContext
  ) {
    super(dialog, {
      livePreview: 'filter',
    });

    this.before = this.column.getFilter();
  }

  private updateFilter(filter: string | RegExp | null, filterMissing: boolean) {
    if (filter == null && !filterMissing) {
      this.column.setFilter(null);
    } else {
      this.column.setFilter({ filter, filterMissing });
    }
  }

  protected reset() {
    this.findInput('input[type="text"]').value = '';
    this.forEach('input[type=checkbox]', (n: HTMLInputElement) => (n.checked = false));
  }

  protected cancel() {
    if (this.before) {
      this.updateFilter(this.before.filter === '' ? null : this.before.filter, this.before.filterMissing);
    } else {
      this.updateFilter(null, false);
    }
  }

  protected submit() {
    const filterMissing = findFilterMissing(this.node).checked;
    const input = this.findInput('input[type="text"]').value;
    const isRegex = this.findInput('input[type="checkbox"]').checked;
    this.updateFilter(toInput(input, isRegex), filterMissing);
    return true;
  }

  protected build(node: HTMLElement) {
    const bak = this.column.getFilter() || { filter: '', filterMissing: false };
    node.insertAdjacentHTML(
      'beforeend',
      `<input type="text" placeholder="Filter ${this.column.desc.label}..." autofocus
         value="${filterToString(bak)}" list="${this.dialog.idPrefix}_sdl">
    <label class="${cssClass('checkbox')}">
      <input type="checkbox" ${bak.filter instanceof RegExp ? 'checked="checked"' : ''}>
      <span>Use regular expressions</span>
    </label>
    ${filterMissingMarkup(bak.filterMissing)}
    <datalist id="${this.dialog.idPrefix}_sdl"></datalist>`
    );

    const filterMissing = findFilterMissing(node);
    const input = node.querySelector<HTMLInputElement>('input[type="text"]');
    const isRegex = node.querySelector<HTMLInputElement>('input[type="checkbox"]');

    const dl = node.querySelector('datalist')!;
    this.ctx.provider
      .getTaskExecutor()
      .summaryStringStats(this.column)
      .then((r) => {
        if (typeof r === 'symbol') {
          return;
        }
        const { summary } = r;
        matchDataList(dl, summary.topN);
      });

    this.enableLivePreviews([filterMissing, input, isRegex]);

    if (!this.showLivePreviews()) {
      return;
    }
    input.addEventListener(
      'input',
      debounce(() => this.submit(), 100),
      {
        passive: true,
      }
    );
  }
}
