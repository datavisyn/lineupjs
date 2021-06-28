import type { Column } from '../model';
import ActionRenderer from './ActionRenderer';
import AggregateGroupRenderer from './AggregateGroupRenderer';
import AnnotationRenderer from './AnnotationRenderer';
import BarCellRenderer from './BarCellRenderer';
import BooleanCellRenderer from './BooleanCellRenderer';
import BoxplotCellRenderer from './BoxplotCellRenderer';
import BrightnessCellRenderer from './BrightnessCellRenderer';
import CategoricalCellRenderer from './CategoricalCellRenderer';
import CategoricalHeatmapCellRenderer from './CategoricalHeatmapCellRenderer';
import CategoricalStackedDistributionlCellRenderer from './CategoricalStackedDistributionlCellRenderer';
import CircleCellRenderer from './CircleCellRenderer';
import { DefaultCellRenderer } from './DefaultCellRenderer';
import DotCellRenderer from './DotCellRenderer';
import GroupCellRenderer from './GroupCellRenderer';
import HeatmapCellRenderer from './HeatmapCellRenderer';
import HistogramCellRenderer from './HistogramCellRenderer';
import ImageCellRenderer from './ImageCellRenderer';
import { ERenderMode, ICellRendererFactory } from './interfaces';
import InterleavingCellRenderer from './InterleavingCellRenderer';
import LinkCellRenderer from './LinkCellRenderer';
import LinkMapCellRenderer from './LinkMapCellRenderer';
import LoadingCellRenderer from './LoadingCellRenderer';
import MapBarCellRenderer from './MapBarCellRenderer';
import MultiLevelCellRenderer from './MultiLevelCellRenderer';
import RankCellRenderer from './RankCellRenderer';
import SelectionRenderer from './SelectionRenderer';
import SetCellRenderer from './SetCellRenderer';
import SparklineCellRenderer from './SparklineCellRenderer';
import StringCellRenderer from './StringCellRenderer';
import TableCellRenderer from './TableCellRenderer';
import UpSetCellRenderer from './UpSetCellRenderer';
import VerticalBarCellRenderer from './VerticalBarCellRenderer';
import DateCellRenderer from './DateCellRenderer';
import DateHistogramCellRenderer from './DateHistogramCellRenderer';
import StringHistogramCellRenderer from './StringHistogramCellRenderer';

const defaultCellRenderer = new DefaultCellRenderer();
/**
 * default render factories
 */
export const renderers: { [key: string]: ICellRendererFactory } = {
  actions: new ActionRenderer(),
  aggregate: new AggregateGroupRenderer(),
  annotate: new AnnotationRenderer(),
  boolean: new BooleanCellRenderer(),
  boxplot: new BoxplotCellRenderer(),
  brightness: new BrightnessCellRenderer(),
  catdistributionbar: new CategoricalStackedDistributionlCellRenderer(),
  categorical: new CategoricalCellRenderer(),
  circle: new CircleCellRenderer(),
  date: new DateCellRenderer(),
  default: defaultCellRenderer,
  dot: new DotCellRenderer(),
  group: new GroupCellRenderer(),
  heatmap: new HeatmapCellRenderer(),
  catheatmap: new CategoricalHeatmapCellRenderer(),
  histogram: new HistogramCellRenderer(),
  datehistogram: new DateHistogramCellRenderer(),
  image: new ImageCellRenderer(),
  interleaving: new InterleavingCellRenderer(),
  link: new LinkCellRenderer(),
  linkMap: new LinkMapCellRenderer(),
  loading: new LoadingCellRenderer(),
  nested: new MultiLevelCellRenderer(false),
  number: new BarCellRenderer(),
  mapbars: new MapBarCellRenderer(),
  rank: new RankCellRenderer(),
  selection: new SelectionRenderer(),
  set: new SetCellRenderer(),
  sparkline: new SparklineCellRenderer(),
  stack: new MultiLevelCellRenderer(),
  string: new StringCellRenderer(),
  stringhist: new StringHistogramCellRenderer(),
  table: new TableCellRenderer(),
  upset: new UpSetCellRenderer(),
  verticalbar: new VerticalBarCellRenderer(),
};

export function chooseRenderer(col: Column, renderers: { [key: string]: ICellRendererFactory }): ICellRendererFactory {
  const r = renderers[col.getRenderer()];
  return r && typeof r.create === 'function' ? r : defaultCellRenderer;
}

export function chooseGroupRenderer(
  col: Column,
  renderers: { [key: string]: ICellRendererFactory }
): ICellRendererFactory {
  const r = renderers[col.getGroupRenderer()];
  return r && typeof r.createGroup === 'function' ? r : defaultCellRenderer;
}

export function chooseSummaryRenderer(
  col: Column,
  renderers: { [key: string]: ICellRendererFactory }
): ICellRendererFactory {
  const r = renderers[col.getSummaryRenderer()];
  return r && typeof r.createSummary === 'function' ? r : defaultCellRenderer;
}

/**
 * determined the list of possible renderers for a given colum
 * @param col the column to resolve the renderers
 * @param renderers map of possible renderers
 * @param canRender optional custom canRender function
 */
export function getPossibleRenderer(
  col: Column,
  renderers: { [key: string]: ICellRendererFactory },
  canRender?: (type: string, renderer: ICellRendererFactory, col: Column, mode: ERenderMode) => boolean
) {
  const all = Object.keys(renderers)
    .filter(Boolean)
    .map((type) => ({ type, factory: renderers[type] }));

  const item = all.filter(
    ({ type, factory }) =>
      typeof factory.create === 'function' &&
      factory.canRender(col, ERenderMode.CELL) &&
      (!canRender || canRender(type, factory, col, ERenderMode.CELL))
  );
  const group = all.filter(
    ({ type, factory }) =>
      typeof factory.createGroup === 'function' &&
      factory.canRender(col, ERenderMode.GROUP) &&
      (!canRender || canRender(type, factory, col, ERenderMode.GROUP))
  );
  const summary = all.filter(
    ({ type, factory }) =>
      typeof factory.createSummary === 'function' &&
      factory.canRender(col, ERenderMode.SUMMARY) &&
      (!canRender || canRender(type, factory, col, ERenderMode.SUMMARY))
  );

  return {
    item: item.map(({ type, factory }) => ({ type, label: factory.title })),
    group: group.map(({ type, factory }) => ({ type, label: factory.groupTitle || factory.title })),
    summary: summary.map(({ type, factory }) => ({
      type,
      label: factory.summaryTitle || factory.groupTitle || factory.title,
    })),
  };
}
