import {Column, isNumbersColumn, IDataRow, INumberColumn, isNumberColumn} from '../model';
import {colorOf} from './impose';
import {IRenderContext, ERenderMode, ICellRendererFactory, IImposer, ICellRenderer, IGroupCellRenderer, ISummaryRenderer} from './interfaces';
import {renderMissingDOM} from './missing';
import {noRenderer, setText} from './utils';
import {cssClass} from '../styles';

export default class CircleCellRenderer implements ICellRendererFactory {
  readonly title: string = 'Proportional Symbol';

  canRender(col: Column, mode: ERenderMode): boolean {
    return isNumberColumn(col) && mode === ERenderMode.CELL && !isNumbersColumn(col);
  }

  create(col: INumberColumn, _context: IRenderContext, imposer?: IImposer): ICellRenderer {
    return {
      template: `<div style="background: radial-gradient(circle closest-side, red 100%, transparent 100%)" title="">
              <div class="${cssClass('hover-only')} ${cssClass('bar-label')}"></div>
          </div>`,
      update: (n: HTMLElement, d: IDataRow) => {
        const v = col.getNumber(d);
        const p = Math.round(v * 100);
        const missing = renderMissingDOM(n, col, d);
        n.style.background = missing ? null : `radial-gradient(circle closest-side, ${colorOf(col, d, imposer)} ${p}%, transparent ${p}%)`;
        setText(n.firstElementChild!, col.getLabel(d));
      }
    };
  }

  createGroup(): IGroupCellRenderer {
    return noRenderer;
  }

  createSummary(): ISummaryRenderer {
    return noRenderer;
  }
}
