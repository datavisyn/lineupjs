import {Column, IDataRow} from '../model';
import {ERenderMode, ICellRendererFactory, IGroupCellRenderer, ISummaryRenderer, ICellRenderer} from './interfaces';
import {renderMissingDOM} from './missing';
import {noRenderer, setText} from './utils';

/**
 * default renderer instance rendering the value as a text
 * @internal
 */
export class DefaultCellRenderer implements ICellRendererFactory {
  title: string = 'String';
  groupTitle: string = 'None';
  summaryTitle: string = 'None';

  canRender(_col: Column, _mode: ERenderMode): boolean {
    return true;
  }

  create(col: Column): ICellRenderer {
    return {
      template: `<div> </div>`,
      update: (n: HTMLDivElement, d: IDataRow) => {
        renderMissingDOM(n, col, d);
        const l = col.getLabel(d);
        setText(n, l);
        n.title = l;
      }
    };
  }

  createGroup(_col: Column): IGroupCellRenderer {
    return noRenderer;
  }

  createSummary(): ISummaryRenderer {
    return noRenderer;
  }
}
