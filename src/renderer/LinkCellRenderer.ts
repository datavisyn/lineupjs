import {LinkColumn, Column, IDataRow, IOrderedGroup} from '../model';
import {IRenderContext, ERenderMode, ICellRendererFactory, ISummaryRenderer, IGroupCellRenderer, ICellRenderer} from './interfaces';
import {renderMissingDOM} from './missing';
import {noRenderer, setText} from './utils';
import {cssClass} from '../styles';
import {ISequence} from '../internal';

export default class LinkCellRenderer implements ICellRendererFactory {
  readonly title: string = 'Link';

  canRender(col: Column, mode: ERenderMode): boolean {
    return col instanceof LinkColumn && mode !== ERenderMode.SUMMARY;
  }

  create(col: LinkColumn): ICellRenderer {
    const align = col.alignment || 'left';
    return {
      template: `<a${align !== 'left' ? ` class="${cssClass(align)}"` : ''} target="_blank" rel="noopener" href=""></a>`,
      update: (n: HTMLAnchorElement, d: IDataRow) => {
        renderMissingDOM(n, col, d);
        const v = col.getLink(d);
        n.href = v ? v.href : '';
        if (col.escape) {
          setText(n, v ? v.alt : '');
        } else {
          n.innerHTML = v ? v.alt : '';
        }
      }
    };
  }

  private static exampleText(col: LinkColumn, rows: ISequence<IDataRow>) {
    const numExampleRows = 5;
    const examples = <string[]>[];
    rows.every((row) => {
      const v = col.getLink(row);
      if (!v) {
        return true;
      }
      examples.push(`<a target="_blank" rel="noopener"  href="${v.href}">${v.alt}</a>`);
      return examples.length < numExampleRows;
    });
    if (examples.length === 0) {
      return '';
    }
    return `${examples.join(', ')}${examples.length < rows.length ? ', &hellip;' : ''}`;
  }

  createGroup(col: LinkColumn, context: IRenderContext): IGroupCellRenderer {
    return {
      template: `<div> </div>`,
      update: (n: HTMLDivElement, group: IOrderedGroup) => {
        return context.tasks.groupExampleRows(col, group, 'link', (rows) => LinkCellRenderer.exampleText(col, rows)).then((text) => {
          if (typeof text === 'symbol') {
            return;
          }
          n.classList.toggle(cssClass('missing'), !text);
          n.innerHTML = text;
        });
      }
    };
  }

  createSummary(): ISummaryRenderer {
    return noRenderer;
  }
}
