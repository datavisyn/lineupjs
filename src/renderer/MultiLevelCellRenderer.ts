import {ISequence, round} from '../internal';
import {Column, IDataRow, INumberColumn, isNumberColumn, IMultiLevelColumn, isMultiLevelColumn, IOrderedGroup, DEFAULT_COLOR} from '../model';
import {medianIndex} from '../model/internalNumber';
import {COLUMN_PADDING} from '../styles';
import {AAggregatedGroupRenderer} from './AAggregatedGroupRenderer';
import {IRenderContext, ERenderMode, ICellRendererFactory, IImposer, IRenderCallback, IGroupCellRenderer, ICellRenderer, ISummaryRenderer} from './interfaces';
import {renderMissingCanvas, renderMissingDOM} from './missing';
import {matchColumns, multiLevelGridCSSClass, setText, multiAdaptDynamicColorToBgColor} from './utils';
import {cssClass} from '../styles';
import {IAbortAblePromise, abortAbleAll} from 'lineupengine';
import {colorOf} from './impose';

/** @internal */
export interface ICols {
  column: Column;
  shift: number;
  width: number;
  template: string;
  rendererId: string;
  renderer: ICellRenderer | null;
  groupRenderer: IGroupCellRenderer | null;
  summaryRenderer: ISummaryRenderer | null;
}

/**
 * @internal
 * @param parent Parent column
 * @param context Render context
 * @param stacked Are the columns stacked?
 * @param mode Render mode
 * @param imposer Imposer object
 */
export function createData(parent: {children: Column[]} & Column, context: IRenderContext, stacked: boolean, mode: ERenderMode, imposer?: IImposer): {cols: ICols[], stacked: boolean, padding: number} {
  const padding = COLUMN_PADDING;
  let offset = 0;
  const cols = parent.children.map((column) => {
    const shift = offset;
    const width = column.getWidth();
    offset += width;
    offset += (!stacked ? padding : 0);

    const renderer = mode === ERenderMode.CELL ? context.renderer(column, imposer) : null;
    const groupRenderer = mode === ERenderMode.GROUP ? context.groupRenderer(column, imposer) : null;
    const summaryRenderer = mode === ERenderMode.GROUP ? context.summaryRenderer(column, false, imposer) : null;
    let template: string = '';
    let rendererId: string = '';
    switch (mode) {
      case ERenderMode.CELL:
        template = renderer!.template;
        rendererId = column.getRenderer();
        break;
      case ERenderMode.GROUP:
        template = groupRenderer!.template;
        rendererId = column.getGroupRenderer();
        break;
      case ERenderMode.SUMMARY:
        template = summaryRenderer!.template;
        rendererId = column.getSummaryRenderer();
        break;
    }
    // inject data attributes
    template = template.replace(/^<([^ >]+)([ >])/, `<$1 data-column-id="${column.id}" data-renderer="${rendererId}"$2`);
    // inject classes
    if (/^<([^>]+) class="([ >]*)/.test(template)) {
      // has class attribute
      template = template.replace(/^<([^>]+) class="([ >]*)/, `<$1 class="${cssClass(`renderer-${rendererId}`)} $2`);
    } else {
      // inject as the others
      template = template.replace(/^<([^ >]+)([ >])/, `<$1 class="${cssClass(`renderer-${rendererId}`)}"$2`);
    }
    return {
      column,
      shift,
      width,
      template,
      rendererId,
      renderer,
      groupRenderer,
      summaryRenderer
    };
  });
  return {cols, stacked, padding};
}

function hasLabelOverlaps(context: IRenderContext, cols: ICols[], d: IDataRow, imposer?: IImposer) {
  const data = cols.map((col) => {
    const label = col.column.getLabel(d);
    const value = (<INumberColumn>col.column).getNumber(d);
    return {
      width: (value * col.width),
      label,
      value,
      color: colorOf(col.column, d, imposer, value),
    };
  });
  // last one doesn't matter
  if (!data.some((d, i) => i < data.length - 1 && (Number.isNaN(d.value) || d.width < context.measureNumberText(d.label)))) {
    return null;
  }
  return data;
}

/** @internal */
export default class MultiLevelCellRenderer extends AAggregatedGroupRenderer<IMultiLevelColumn & Column> implements ICellRendererFactory {
  readonly title: string;

  constructor(private readonly stacked: boolean = true, private readonly renderValue = false) {
    super();
    this.title = this.stacked ? 'Stacked Bar' : 'Nested';
  }

  canRender(col: Column, mode: ERenderMode): boolean {
    return isMultiLevelColumn(col) && mode !== ERenderMode.SUMMARY;
  }

  create(col: IMultiLevelColumn & Column, context: IRenderContext, imposer?: IImposer): ICellRenderer {
    const {cols, stacked} = createData(col, context, this.stacked, ERenderMode.CELL, imposer);
    const width = context.colWidth(col);
    return {
      template: `<div class='${multiLevelGridCSSClass(context.idPrefix, col)} ${!stacked ? cssClass('grid-space') : ''}'>${cols.map((d) => d.template).join('')}</div>`,
      update: (n: HTMLDivElement, d: IDataRow, i: number, group: IOrderedGroup) => {
        if (renderMissingDOM(n, col, d)) {
          return null;
        }
        let combinedLabelNode: HTMLElement | null = null;
        if (n.lastElementChild!.classList.contains(cssClass('bar-label'))) {
          combinedLabelNode = <HTMLElement>n.lastElementChild!;
          combinedLabelNode.remove();
        }

        matchColumns(n, cols, context);

        const toWait: IAbortAblePromise<void>[] = [];
        const children = <HTMLElement[]>Array.from(n.children);
        const total = col.getWidth();
        let missingWeight = 0;
        cols.forEach((col, ci) => {
          const weight = col.width / total;
          const cnode = children[ci];
          cnode.classList.add(cssClass(this.stacked ? 'stack-sub' : 'nested-sub'), cssClass('detail'));
          cnode.dataset.group = 'd';
          cnode.style.transform = stacked ? `translate(-${round((missingWeight / weight) * 100, 4)}%,0)` : null;
          (<any>cnode.style).gridColumnStart = (ci + 1).toString();
          const r = col.renderer!.update(cnode, d, i, group);
          if (stacked) {
            missingWeight += (1 - (<INumberColumn>col.column).getNumber(d)) * weight;
          }
          if (r) {
            toWait.push(r);
          }
        });

        const overlapData = stacked ? hasLabelOverlaps(context, cols, d, imposer) : null;
        if (!overlapData) {
          n.classList.remove(cssClass('stack-label'));
          if (toWait.length > 0) {
            return <IAbortAblePromise<void>>abortAbleAll(toWait);
          }
          return null;
        }
        n.classList.add(cssClass('stack-label'));

        const combinedLabel = overlapData.map((col) => col.label).join(' ');
        if (!combinedLabelNode) {
          combinedLabelNode = context.asElement(`<div class="${cssClass('bar-label')}"><span ${this.renderValue ? '' : `class="${cssClass('hover-only')}"`}></span></div>`);
        }
        n.appendChild(combinedLabelNode);
        setText(combinedLabelNode.firstElementChild!, combinedLabel);

        const sections = overlapData.map((d) => ({color: d.color || DEFAULT_COLOR, width: d.width / total}));
        multiAdaptDynamicColorToBgColor(<HTMLElement>combinedLabelNode.firstElementChild!, combinedLabel, sections);

        if (toWait.length > 0) {
          return <IAbortAblePromise<void>>abortAbleAll(toWait);
        }
        return null;
      },
      render: (ctx: CanvasRenderingContext2D, d: IDataRow, i: number, group: IOrderedGroup) => {
        if (renderMissingCanvas(ctx, col, d, width)) {
          return null;
        }
        const toWait: {shift: number, r: IAbortAblePromise<IRenderCallback>}[] = [];
        let stackShift = 0;
        for (const col of cols) {
          const cr = col.renderer!;
          if (cr.render) {
            const shift = col.shift - stackShift;
            ctx.translate(shift, 0);
            const r = cr.render(ctx, d, i, group);
            if (typeof r !== 'boolean' && r) {
              toWait.push({shift, r});
            }
            ctx.translate(-shift, 0);
          }
          if (stacked) {
            stackShift += col.width * (1 - (<INumberColumn>col.column).getNumber(d));
          }
        }

        if (toWait.length === 0) {
          return null;
        }

        return abortAbleAll(toWait.map((d) => d.r)).then((callbacks) => {
          return (ctx: CanvasRenderingContext2D) => {
            if (typeof callbacks === 'symbol') {
              return;
            }
            for (let i = 0; i < callbacks.length; ++i) {
              const callback = callbacks[i];
              if (typeof callback !== 'function') {
                continue;
              }
              const shift = toWait[i].shift;
              ctx.translate(shift, 0);
              callback(ctx);
              ctx.translate(-shift, 0);
            }
          };
        });
      }
    };
  }


  createGroup(col: IMultiLevelColumn & Column, context: IRenderContext, imposer?: IImposer): IGroupCellRenderer {
    if (this.stacked && isNumberColumn(col)) {
      return super.createGroup(col, context, imposer);
    }

    const {cols} = createData(col, context, false, ERenderMode.GROUP, imposer);
    return {
      template: `<div class='${multiLevelGridCSSClass(context.idPrefix, col)} ${cssClass('grid-space')}'>${cols.map((d) => d.template).join('')}</div>`,
      update: (n: HTMLElement, group: IOrderedGroup) => {
        matchColumns(n, cols, context);

        const toWait: IAbortAblePromise<void>[] = [];
        const children = <HTMLElement[]>Array.from(n.children);
        cols.forEach((col, ci) => {
          const cnode = children[ci];
          cnode.classList.add(cssClass(this.stacked ? 'stack-sub' : 'nested-sub'), cssClass('group'));
          cnode.dataset.group = 'g';
          (<any>cnode.style).gridColumnStart = (ci + 1).toString();
          const r = col.groupRenderer!.update(cnode, group);
          if (r) {
            toWait.push(r);
          }
        });

        if (toWait.length > 0) {
          return <IAbortAblePromise<void>>abortAbleAll(toWait);
        }
        return null;
      }
    };
  }

  protected aggregatedIndex(rows: ISequence<IDataRow>, col: IMultiLevelColumn & Column) {
    console.assert(isNumberColumn(col));
    return medianIndex(rows, (<INumberColumn><any>col));
  }
}
