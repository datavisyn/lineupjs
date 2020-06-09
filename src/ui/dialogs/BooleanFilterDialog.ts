import {BooleanColumn} from '../../model';
import ADialog, {IDialogContext} from './ADialog';
import {cssClass} from '../../styles';

/** @internal */
export default class BooleanFilterDialog extends ADialog {

  private readonly before: boolean | null;

  constructor(private readonly column: BooleanColumn, dialog: IDialogContext) {
    super(dialog, {
      livePreview: 'filter'
    });
    this.before = this.column.getFilter();
  }

  protected build(node: HTMLElement) {
    node.insertAdjacentHTML('beforeend', `
     <label class="${cssClass('checkbox')}"><input type="radio" name="boolean_check" value="null" ${this.before == null ? 'checked="checked"' : ''}><span>No Filter</span></label>
     <label class="${cssClass('checkbox')}"><input type="radio" name="boolean_check" value="true" ${this.before === true ? 'checked="checked"' : ''}><span>True</span></label>
     <label class="${cssClass('checkbox')}"><input type="radio" name="boolean_check" value="false" ${this.before === false ? 'checked="checked"' : ''}><span>False</span></label>
    `);
    this.enableLivePreviews('input[type=radio]');
  }

  private updateFilter(filter: boolean | null) {
    this.column.setFilter(filter);
  }

  protected reset() {
    const v = 'null';
    this.forEach('input[type="radio"]', (d: HTMLInputElement) => d.checked = d.value === v);
  }

  protected cancel() {
    this.updateFilter(this.before);
  }

  protected submit() {
    const isTrue = this.findInput('input[type="radio"][value="true"]').checked;
    const isFalse = this.findInput('input[type="radio"][value="false"]').checked;
    this.updateFilter(isTrue ? true : (isFalse ? false : null));
    return true;
  }
}
