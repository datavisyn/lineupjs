import type { SelectionColumn } from '../../model';
import ADialog, { IDialogContext } from './ADialog';
import { cssClass } from '../../styles';
import type { IRankingHeaderContext } from '../interfaces';

/** @internal */
export default class SelectionFilterDialog extends ADialog {
  private readonly before: number[] | null;

  constructor(
    private readonly column: SelectionColumn,
    dialog: IDialogContext,
    private readonly ctx: IRankingHeaderContext
  ) {
    super(dialog, {
      livePreview: 'filter',
    });

    this.before = this.column.getFilter();
  }

  private updateFilter(filter: number[] | null) {
    this.column.setFilter(filter);
  }

  protected reset() {
    this.findInput('input[value=none]').checked = true;
  }

  protected cancel() {
    if (this.before) {
      this.updateFilter(this.before);
    } else {
      this.updateFilter(null);
    }
  }

  protected submit() {
    const chosen = this.findInput('input[name=mode]:checked').value as 'none' | 'keep' | 'update';
    if (chosen === 'none') {
      this.updateFilter(null);
    } else if (chosen === 'update') {
      this.updateFilter(this.ctx.provider.getSelection());
    }
    return true;
  }

  protected build(node: HTMLElement) {
    const bak = this.column.getFilter() ?? [];
    const current = this.ctx.provider.getSelection().length;
    node.insertAdjacentHTML(
      'beforeend',
      `<label class="${cssClass('checkbox')}">
          <input type="radio" ${bak.length === 0 ? 'checked="checked"' : ''} name="mode" value="none">
          <span>Remove filter</span>
        </label>`
    );
    node.insertAdjacentHTML(
      'beforeend',
      `<label class="${cssClass('checkbox')}">
          <input type="radio" ${bak.length > 0 ? 'checked="checked"' : ''} name="mode" value="keep">
          <span>Keep current filter (${bak.length} rows)</span>
        </label>`
    );
    node.insertAdjacentHTML(
      'beforeend',
      `<label class="${cssClass('checkbox')}" style="padding-bottom: 0.6em">
          <input type="radio" name="mode" value="update" ${current === 0 ? 'disabled="disabled"' : ''}>
          <span>Filter currently selected (${this.ctx.provider.getSelection().length} rows)</span>
        </label>`
    );
    const inputs = Array.from(node.querySelectorAll('input'));

    this.enableLivePreviews(inputs);
  }
}
