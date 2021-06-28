import type { IAbortAblePromise } from 'lineupengine';
import type {
  Column,
  IDataRow,
  IOrderedGroup,
  INumberColumn,
  ICategoricalLikeColumn,
  IDateColumn,
  StringColumn,
} from '../model';
import type { IDataProvider } from '../provider';
import type DialogManager from '../ui/dialogs/DialogManager';
import type {
  ISequence,
  IDateStatistics,
  ICategoricalStatistics,
  IAdvancedBoxPlotData,
  IStatistics,
  IStringStatistics,
} from '../internal';

export interface IImposer {
  color?(row: IDataRow | null, valueHint?: number): string | null;
}

export declare type IRenderCallback = (ctx: CanvasRenderingContext2D) => void;

/**
 * a cell renderer for rendering a cell of specific column
 */
export interface ICellRenderer {
  /**
   * template as a basis for the update
   */
  readonly template: string;

  /**
   * update a given node (create using the template) with the given data
   * @param node the node to update
   * @param d the data item
   * @param i the order relative index
   * @param group the group this row is part of
   */
  update(node: HTMLElement, d: IDataRow, i: number, group: IOrderedGroup): void | IAbortAblePromise<void> | null;

  /**
   * render a low detail canvas row
   * @return true if a dom element is needed
   */
  render?(
    ctx: CanvasRenderingContext2D,
    d: IDataRow,
    i: number,
    group: IOrderedGroup
  ): void | IAbortAblePromise<IRenderCallback> | boolean | null;
}

/**
 * a cell renderer for rendering a cell of specific column
 */
export interface IGroupCellRenderer {
  /**
   * template as a basis for the update
   */
  readonly template: string;

  /**
   * update a given node (create using the template) with the given data
   * @param node the node to update
   * @param group the group to render
   */
  update(node: HTMLElement, group: IOrderedGroup): void | IAbortAblePromise<void> | null;
}

export interface ISummaryRenderer {
  /**
   * template as a basis for the update
   */
  readonly template: string;

  update(node: HTMLElement): void | IAbortAblePromise<void> | null;
}

export interface IRenderTask<T> {
  then<U = void>(onfullfilled: (value: T | symbol) => U): U | IAbortAblePromise<U>;
}

export interface IRenderTasks {
  groupRows<T>(
    col: Column,
    group: IOrderedGroup,
    key: string,
    compute: (rows: ISequence<IDataRow>) => T
  ): IRenderTask<T>;
  groupExampleRows<T>(
    col: Column,
    group: IOrderedGroup,
    key: string,
    compute: (rows: ISequence<IDataRow>) => T
  ): IRenderTask<T>;

  groupBoxPlotStats(
    col: Column & INumberColumn,
    group: IOrderedGroup,
    raw?: boolean
  ): IRenderTask<{ group: IAdvancedBoxPlotData; summary: IAdvancedBoxPlotData; data: IAdvancedBoxPlotData }>;
  groupNumberStats(
    col: Column & INumberColumn,
    group: IOrderedGroup,
    raw?: boolean
  ): IRenderTask<{ group: IStatistics; summary: IStatistics; data: IStatistics }>;
  groupCategoricalStats(
    col: Column & ICategoricalLikeColumn,
    group: IOrderedGroup
  ): IRenderTask<{ group: ICategoricalStatistics; summary: ICategoricalStatistics; data: ICategoricalStatistics }>;
  groupDateStats(
    col: Column & IDateColumn,
    group: IOrderedGroup
  ): IRenderTask<{ group: IDateStatistics; summary: IDateStatistics; data: IDateStatistics }>;
  groupStringStats(
    col: StringColumn,
    group: IOrderedGroup
  ): IRenderTask<{ group: IStringStatistics; summary: IStringStatistics; data: IStringStatistics }>;

  summaryBoxPlotStats(
    col: Column & INumberColumn,
    raw?: boolean
  ): IRenderTask<{ summary: IAdvancedBoxPlotData; data: IAdvancedBoxPlotData }>;
  summaryNumberStats(
    col: Column & INumberColumn,
    raw?: boolean
  ): IRenderTask<{ summary: IStatistics; data: IStatistics }>;
  summaryCategoricalStats(
    col: Column & ICategoricalLikeColumn
  ): IRenderTask<{ summary: ICategoricalStatistics; data: ICategoricalStatistics }>;
  summaryDateStats(col: Column & IDateColumn): IRenderTask<{ summary: IDateStatistics; data: IDateStatistics }>;
  summaryStringStats(col: StringColumn): IRenderTask<{ summary: IStringStatistics; data: IStringStatistics }>;
}

/**
 * context for rendering, wrapped as an object for easy extensibility
 */
export interface IRenderContext {
  readonly tasks: IRenderTasks;
  /**
   * render a column
   * @param col
   */
  renderer(col: Column, imposer?: IImposer): ICellRenderer;

  /**
   * render a column
   * @param col
   */
  groupRenderer(col: Column, imposer?: IImposer): IGroupCellRenderer;

  summaryRenderer(co: Column, interactive: boolean, imposer?: IImposer): ISummaryRenderer;

  /**
   * prefix used for all generated id names
   */
  readonly idPrefix: string;

  asElement(html: string): HTMLElement;

  colWidth(col: Column): number;

  readonly provider: IDataProvider;
  readonly dialogManager: DialogManager;
}

export enum ERenderMode {
  CELL,
  GROUP,
  SUMMARY,
}

export interface ICellRendererFactory {
  readonly title: string;
  readonly groupTitle?: string;
  readonly summaryTitle?: string;

  canRender(col: Column, mode: ERenderMode): boolean;

  create?(col: Column, context: IRenderContext, imposer?: IImposer): ICellRenderer;

  createGroup?(col: Column, context: IRenderContext, imposer?: IImposer): IGroupCellRenderer;

  createSummary?(col: Column, context: IRenderContext, interactive: boolean, imposer?: IImposer): ISummaryRenderer;
}
