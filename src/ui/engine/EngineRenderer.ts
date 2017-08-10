/**
 * Created by Samuel Gratzl on 18.07.2017.
 */
import {AEventDispatcher, debounce} from '../../utils';
import {default as ABodyRenderer} from '../ABodyRenderer';
import DataProvider, {default as ADataProvider, IDataRow} from '../../provider/ADataProvider';
import {default as Column, ICategoricalStatistics, IFlatColumn, IStatistics} from '../../model/Column';
import {createDOM} from '../../renderer';
import {filters as defaultFilters} from '../../dialogs';
import {default as RenderColumn, IRankingContextContainer} from './RenderColumn';
import EngineRankingRenderer from './EngineRankingRenderer';
import {uniformContext} from 'lineupengine/src';
import StringColumn from '../../model/StringColumn';
import Ranking from '../../model/Ranking';
import {ILineUpRenderer} from '../index';
import {ILineUpConfig, IRenderingOptions} from '../../lineup';
import {isCategoricalColumn} from '../../model/CategoricalColumn';
import NumberColumn from '../../model/NumberColumn';


export default class EngineRenderer extends AEventDispatcher implements ILineUpRenderer {
  static readonly EVENT_HOVER_CHANGED = ABodyRenderer.EVENT_HOVER_CHANGED;
  static readonly EVENT_RENDER_FINISHED = ABodyRenderer.EVENT_RENDER_FINISHED;

  protected readonly options: Readonly<ILineUpConfig>;

  private readonly histCache = new Map<string, IStatistics | ICategoricalStatistics | null | Promise<IStatistics | ICategoricalStatistics>>();

  readonly node: HTMLElement;

  readonly ctx: IRankingContextContainer & { data: IDataRow[] };

  private readonly renderer: EngineRankingRenderer;

  constructor(private data: DataProvider, parent: Element, options: Readonly<ILineUpConfig>) {
    super();
    this.options = options;
    this.node = parent.ownerDocument.createElement('main');
    parent.appendChild(this.node);

    const bodyOptions: any = this.options.body;

    function findOption(key: string, defaultValue: any): any {
      if (key in bodyOptions) {
        return bodyOptions[key];
      }
      if (key.indexOf('.') > 0) {
        const p = key.substring(0, key.indexOf('.'));
        key = key.substring(key.indexOf('.') + 1);
        if (p in bodyOptions && key in bodyOptions[p]) {
          return bodyOptions[p][key];
        }
      }
      return defaultValue;
    }

    this.ctx = {
      provider: data,
      filters: Object.assign({}, defaultFilters),
      linkTemplates: <string[]>[],
      autoRotateLabels: false,
      searchAble: (col: Column) => col instanceof StringColumn,
      option: findOption,
      statsOf: (col: Column) => {
        const r = this.histCache.get(col.id);
        if (r == null || r instanceof Promise) {
          return null;
        }
        return r;
      },
      renderer: (col: Column) => createDOM(col, this.options.renderers, this.ctx),
      idPrefix: this.options.idPrefix,
      data: [],
      getRow: (index: number) => this.ctx.data[index]
    };

    this.renderer = new EngineRankingRenderer(this.node, this.options.idPrefix, this.ctx);

    this.data.on(`${ADataProvider.EVENT_SELECTION_CHANGED}.body`, () => this.renderer.updateSelection(data.getSelection()));
  }

  protected createEventList() {
    return super.createEventList().concat([EngineRenderer.EVENT_HOVER_CHANGED, EngineRenderer.EVENT_RENDER_FINISHED]);
  }

  changeDataStorage(data: DataProvider) {
    this.data.on(`${ADataProvider.EVENT_SELECTION_CHANGED}.body`, null);
    this.data.on(`${DataProvider.EVENT_ORDER_CHANGED}.body`, null);

    this.data = data;
    this.ctx.provider = data;

    this.data.on(`${ADataProvider.EVENT_SELECTION_CHANGED}.body`, () => this.renderer.updateSelection(data.getSelection()));
    this.data.on(`${DataProvider.EVENT_ORDER_CHANGED}.body`, () => this.updateHist());

    this.update();
  }

  private updateHist() {
    if (!this.options.header.summary) {
      return;
    }
    const rankings = this.data.getRankings();
    rankings.forEach((ranking) => {
      const order = ranking.getOrder();
      const cols = ranking.flatColumns;
      const histo = order == null ? null : this.data.stats(order);
      cols.filter((d) => d instanceof NumberColumn && !d.isHidden()).forEach((col: any) => {
        this.histCache.set(col.id, histo === null ? null : histo.stats(col));
      });
      cols.filter((d) => isCategoricalColumn(d) && !d.isHidden()).forEach((col: any) => {
        this.histCache.set(col.id, histo === null ? null : histo.hist(col));
      });
    });
  }

  update() {
    const ranking = this.data.getLastRanking();
    const order = ranking.getOrder();
    const data = this.data.view(order);
    this.ctx.data = (Array.isArray(data) ? data : []).map(((v, i) => ({v, dataIndex: order[i]})));
    const that = this;
    ranking.on(`${Ranking.EVENT_DIRTY}.body`, debounce(function (this: { primaryType: string }) {
      if (this.primaryType !== Column.EVENT_WIDTH_CHANGED) {
        that.update();
      }
    }));

    const flatCols: IFlatColumn[] = [];
    ranking.flatten(flatCols, 0, 1, 0);
    const cols = flatCols.map((c) => c.col);
    const columns = cols.map((c, i) => {
      const renderer = createDOM(c, this.options.renderers, this.ctx);
      return new RenderColumn(c, c.getRendererType(), renderer, i);
    });

    if (this.histCache.size === 0) {
      this.updateHist();
    }

    cols.forEach((c) => c.on(`${Column.EVENT_WIDTH_CHANGED}.body`, () => {
      this.renderer.updateColumnWidths();
    }));

    const rowContext = uniformContext(this.ctx.data.length, 20);

    this.renderer.render(columns, rowContext);
  }

  fakeHover(dataIndex: number) {
    const old = this.node.querySelector(`[data-data-index].lu-hovered`);
    if (old) {
      old.classList.remove('lu-hovered');
    }
    const item = this.node.querySelector(`[data-data-index="${dataIndex}"]`);
    if (item) {
      item.classList.add('lu-hovered');
    }
  }

  destroy() {
    // TODO
  }

  scrollIntoView(index: number) {
    // TODO
  }

  setBodyOption(option: keyof IRenderingOptions, value: boolean) {
    // TODO
  }
}
