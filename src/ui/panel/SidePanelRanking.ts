import { clear, suffix } from '../../internal';
import { Ranking, isSupportType } from '../../model';
import { aria, cssClass } from '../../styles';
import MoreRankingOptionsDialog from '../dialogs/MoreRankingOptionsDialog';
import { actionCSSClass } from '../header';
import type { IRankingHeaderContext } from '../interfaces';
import { dialogContext } from '../dialogs';
import Hierarchy from './Hierarchy';
import type { ISidePanelOptions } from './SidePanel';
import SidePanelEntryVis from './SidePanelEntryVis';

/** @internal */
export default class SidePanelRanking {
  readonly header: HTMLElement;
  readonly dropdown: HTMLElement;
  readonly node: HTMLElement;

  private readonly hierarchy: Hierarchy | null;
  private readonly entries = new Map<string, SidePanelEntryVis>();

  constructor(
    public readonly ranking: Ranking,
    private ctx: IRankingHeaderContext,
    document: Document,
    private readonly options: Readonly<ISidePanelOptions>
  ) {
    this.node = document.createElement('section');
    this.header = document.createElement('div');
    this.dropdown = document.createElement('div');

    this.node.classList.add(cssClass('side-panel-ranking'));
    this.header.classList.add(cssClass('side-panel-ranking-header'), cssClass('side-panel-ranking-label'));
    this.dropdown.classList.add(cssClass('side-panel-ranking-label'));

    this.dropdown.innerHTML = this.header.innerHTML = `<span>${ranking.getLabel()}</span><i class="${actionCSSClass(
      'more'
    )}" title="More &hellip;">${aria('More &hellip;')}</i>`;
    (this.header.lastElementChild! as HTMLElement).onclick = (this.dropdown.lastElementChild! as HTMLElement).onclick =
      (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        const dialog = new MoreRankingOptionsDialog(ranking, dialogContext(ctx, 1, evt), ctx);
        dialog.open();
      };

    this.hierarchy = this.options.hierarchy ? new Hierarchy(ctx, document) : null;

    this.init();
  }

  private init() {
    this.node.innerHTML = `<main class="${cssClass('side-panel-ranking-main')}"></main>`;
    if (this.hierarchy) {
      this.node.insertBefore(this.hierarchy.node, this.node.firstChild);
    }

    if (this.hierarchy) {
      this.ranking.on(
        suffix(
          '.panel',
          Ranking.EVENT_GROUP_CRITERIA_CHANGED,
          Ranking.EVENT_SORT_CRITERIA_CHANGED,
          Ranking.EVENT_GROUP_SORT_CRITERIA_CHANGED
        ),
        () => {
          this.updateHierarchy();
        }
      );
    }
    this.ranking.on(
      suffix('.panel', Ranking.EVENT_ADD_COLUMN, Ranking.EVENT_REMOVE_COLUMN, Ranking.EVENT_MOVE_COLUMN),
      () => {
        this.updateList();
        this.updateHierarchy();
      }
    );
    this.ranking.on(suffix('.panel', Ranking.EVENT_LABEL_CHANGED), () => {
      this.dropdown.firstElementChild!.textContent = this.header.firstElementChild!.textContent =
        this.ranking.getLabel();
    });
  }

  get active() {
    return this.node.classList.contains(cssClass('active'));
  }

  set active(value: boolean) {
    this.node.classList.toggle(cssClass('active'), value);
    this.header.classList.toggle(cssClass('active'), value);
    this.dropdown.classList.toggle(cssClass('active'), value);
    if (value) {
      return;
    }
    this.updateList();
    this.updateHierarchy();
  }

  update(ctx: IRankingHeaderContext) {
    this.ctx = ctx;
    this.updateList();
    this.updateHierarchy();
  }

  private updateHierarchy() {
    if (!this.hierarchy || !this.active) {
      return;
    }
    this.hierarchy.update(this.ranking);
  }

  private updateList() {
    if (!this.active) {
      return;
    }
    const node = this.node.querySelector('main')!;
    const columns = this.ranking.flatColumns.filter((d) => !isSupportType(d));

    if (columns.length === 0) {
      clear(node);
      this.entries.forEach((d) => d.destroy());
      this.entries.clear();
      return;
    }

    const currentEntries = new Map(this.entries);
    this.entries.clear();

    columns.forEach((col, i) => {
      const existing = currentEntries.get(col.id);
      if (existing) {
        existing.update(this.ctx);
        if (node.children[i] !== existing.node) {
          // change node order if it doesn't match
          node.appendChild(existing.node);
        }
        this.entries.set(col.id, existing);
        currentEntries.delete(col.id);
        return;
      }

      const entry = new SidePanelEntryVis(col, this.ctx, node.ownerDocument!);
      node.insertBefore(entry.node, node.children[i]);
      this.entries.set(col.id, entry);
    });

    currentEntries.forEach((d) => {
      d.node.remove();
      d.destroy();
    });
  }

  destroy() {
    this.header.remove();
    this.node.remove();
    this.ranking.on(
      suffix(
        '.panel',
        Ranking.EVENT_GROUP_CRITERIA_CHANGED,
        Ranking.EVENT_SORT_CRITERIA_CHANGED,
        Ranking.EVENT_GROUP_SORT_CRITERIA_CHANGED,
        Ranking.EVENT_ADD_COLUMN,
        Ranking.EVENT_MOVE_COLUMN,
        Ranking.EVENT_REMOVE_COLUMN,
        Ranking.EVENT_LABEL_CHANGED
      ),
      null
    );

    this.entries.forEach((d) => d.destroy());
    this.entries.clear();
  }
}
