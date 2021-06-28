import { clear } from '../../internal';
import { Column, Ranking, categoryOf, isSortingAscByDefault, ISortCriteria, isSupportType } from '../../model';
import { aria, cssClass } from '../../styles';
import AddonDialog from '../dialogs/AddonDialog';
import { actionCSSClass, updateHeader } from '../header';
import type { IRankingHeaderContext, IToolbarDialogAddon } from '../interfaces';
import { getToolbarDialogAddons, isGroupAble, isGroupSortAble, isSortAble } from '../toolbarResolvers';
import SearchBox, { ISearchBoxOptions } from './SearchBox';
import { dialogContext } from '../dialogs';
import { setText } from '../../renderer/utils';

interface IColumnItem {
  col: Column;
  id: string;
  text: string;
}
/**
 * @internal
 */
export default class Hierarchy {
  readonly node: HTMLElement;
  readonly groupAdder: SearchBox<IColumnItem>;
  readonly sortAdder: SearchBox<IColumnItem>;
  readonly groupSortAdder: SearchBox<IColumnItem>;

  constructor(private readonly ctx: IRankingHeaderContext, document: Document) {
    this.node = document.createElement('aside');
    this.node.classList.add(cssClass('hierarchy'), cssClass('feature-advanced'), cssClass('feature-ranking'));
    this.node.innerHTML = `
      <section class="${cssClass('group-hierarchy')}">
      </section>
      <section class="${cssClass('sort-hierarchy')}">
      </section>
      <section class="${cssClass('sort-groups-hierarchy')}">
      </section>
    `;
    const options: Partial<ISearchBoxOptions<IColumnItem>> = {
      doc: document,
      placeholder: 'Add Sort Criteria...',
      formatItem: (item: IColumnItem, node: HTMLElement) => {
        node.classList.add(cssClass('typed-icon'));
        node.dataset.typeCat = categoryOf(item.col).name;
        node.dataset.type = item.col.desc.type;
        setText(node, item.text);
      },
    };
    this.groupAdder = new SearchBox(
      Object.assign({}, options, {
        placeholder: 'Add Grouping Criteria...',
      })
    );
    this.groupSortAdder = new SearchBox(
      Object.assign({}, options, {
        placeholder: 'Add Grouping Sort Criteria...',
      })
    );
    this.sortAdder = new SearchBox(options);
  }

  update(ranking: Ranking | null) {
    if (!ranking) {
      this.node.style.display = 'none';
      return;
    }
    this.node.style.display = null;
    this.renderGroups(ranking, this.node.firstElementChild! as HTMLElement);
    this.renderSorting(ranking, this.node.children[1]! as HTMLElement);
    this.renderGroupSorting(ranking, this.node.lastElementChild! as HTMLElement);
  }

  private render<T>(
    node: HTMLElement,
    items: T[],
    toColumn: (item: T) => Column,
    extras: (item: T, node: HTMLElement) => void,
    addonKey: string,
    onChange: (item: T, delta: number) => void
  ) {
    const cache = new Map((Array.from(node.children) as HTMLElement[]).map((d) => [d.dataset.id, d]));
    clear(node);

    items.forEach((d) => {
      const col = toColumn(d);
      const item = cache.get(col.id);
      if (item) {
        node.appendChild(item);
        updateHeader(item, col, 0);
        return;
      }
      const addons = getToolbarDialogAddons(col, addonKey, this.ctx);

      node.insertAdjacentHTML(
        'beforeend',
        `<div data-id="${col.id}" class="${cssClass('toolbar')} ${cssClass('hierarchy-entry')}">
      <div class="${cssClass('label')} ${cssClass('typed-icon')}">${col.label}</div>
      ${addons.length > 0 ? `<i title="Customize" class="${actionCSSClass('customize')}">${aria('Customize')}</i>` : ''}
      <i title="Move Up" class="${actionCSSClass('Move Up')}">${aria('Move Up')}</i>
      <i title="Move Down" class="${actionCSSClass('Move Down')}">${aria('Move Down')}</i>
      <i title="Remove from hierarchy" class="${actionCSSClass('Remove')}">${aria('Remove from hierarchy')}</i>
      </div>`
      );
      const last = node.lastElementChild! as HTMLElement;

      function prevent(evt: Event) {
        evt.preventDefault();
        evt.stopPropagation();
      }

      last.querySelector<HTMLElement>('i[title="Move Down"]')!.onclick = (evt) => {
        prevent(evt);
        onChange(d, +1);
      };
      last.querySelector<HTMLElement>('i[title="Move Up"]')!.onclick = (evt) => {
        prevent(evt);
        onChange(d, -1);
      };
      last.querySelector<HTMLElement>('i[title^=Remove]')!.onclick = (evt) => {
        prevent(evt);
        onChange(d, 0);
      };

      if (addons.length > 0) {
        last.querySelector<HTMLElement>('i[title=Customize]')!.onclick = (evt) => {
          prevent(evt);
          this.customize(col, addons, evt as any);
        };
      }

      extras(d, last);

      updateHeader(last, col, 0);
    });
  }

  private renderGroups(ranking: Ranking, node: HTMLElement) {
    const groups = ranking.getGroupCriteria();

    if (groups.length === 0) {
      clear(node);
      return;
    }

    const click = (col: Column, delta: number) => {
      if (delta === 0) {
        col.groupByMe();
        return;
      }
      const current = col.isGroupedBy();
      col.findMyRanker()!.groupBy(col, current + delta);
    };

    const addButton = (_: Column, last: HTMLElement) => {
      last.insertAdjacentHTML(
        'afterbegin',
        `<i title="Group" class="${actionCSSClass('group')}" data-group="true">${aria('Group')}</i>`
      );
    };

    this.render(node, groups, (d) => d, addButton, 'group', click);
    this.addGroupAdder(ranking, groups, node);
  }

  private renderSorting(ranking: Ranking, node: HTMLElement) {
    const sortCriterias = ranking.getSortCriteria();

    if (sortCriterias.length === 0) {
      clear(node);
      return;
    }

    const click = ({ col }: ISortCriteria, delta: number) => {
      const current = col.isSortedByMe();
      if (!isFinite(delta)) {
        col.sortByMe(current.asc === 'desc', current.priority);
        return;
      }
      if (delta === 0) {
        col.sortByMe(current.asc === 'asc', -1);
        return;
      }
      col.sortByMe(current.asc === 'asc', current.priority! + delta);
    };

    const addButton = (s: ISortCriteria, last: HTMLElement) => {
      last.insertAdjacentHTML(
        'afterbegin',
        `
      <i title="Sort" class="${actionCSSClass('sort')}" data-sort="${s.asc ? 'asc' : 'desc'}">${aria(
          'Toggle Sorting'
        )}</i>`
      );
      last.querySelector<HTMLElement>('i[title=Sort]')!.onclick = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        click(s, Number.POSITIVE_INFINITY);
      };
    };

    this.render(node, sortCriterias, (d) => d.col, addButton, 'sort', click);

    this.addSortAdder(ranking, sortCriterias, node);
  }

  private renderGroupSorting(ranking: Ranking, node: HTMLElement) {
    const sortCriterias = ranking.getGroupSortCriteria();

    if (sortCriterias.length === 0) {
      clear(node);
      return;
    }

    const click = ({ col }: ISortCriteria, delta: number) => {
      const current = col.isGroupSortedByMe();
      if (!isFinite(delta)) {
        col.groupSortByMe(current.asc === 'desc', current.priority);
        return;
      }
      if (delta === 0) {
        col.groupSortByMe(current.asc === 'asc', -1);
        return;
      }
      col.groupSortByMe(current.asc === 'asc', current.priority! + delta);
    };

    const addButton = (s: ISortCriteria, last: HTMLElement) => {
      last.insertAdjacentHTML(
        'afterbegin',
        `
      <i title="Sort Group" class="${actionCSSClass('sort-groups')}" data-sort="${s.asc ? 'asc' : 'desc'}">${aria(
          'Toggle Sorting'
        )}</i>`
      );
      last.querySelector<HTMLElement>('i[title="Sort Group"]')!.onclick = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        click(s, Number.POSITIVE_INFINITY);
      };
    };

    this.render(node, sortCriterias, (d) => d.col, addButton, 'sortGroup', click);

    this.addGroupSortAdder(ranking, sortCriterias, node);
  }

  private addAdder(
    adder: SearchBox<IColumnItem>,
    ranking: Ranking,
    addonKey: string,
    current: Column[],
    node: HTMLElement,
    check: (col: Column) => boolean,
    onSelect: (col: Column) => void
  ) {
    const used = new Set(current);

    adder.data = ranking.children
      .filter((col) => !isSupportType(col) && !used.has(col) && check(col))
      .map((col) => ({ col, id: col.id, text: col.label }));

    adder.on(SearchBox.EVENT_SELECT, (item: IColumnItem) => {
      const addons = getToolbarDialogAddons(item.col, addonKey, this.ctx);
      if (addons.length > 0) {
        this.customize(item.col, addons, adder.node, () => onSelect(item.col));
      } else {
        onSelect(item.col);
      }
    });

    if (adder.data.length <= 0) {
      return;
    }

    const wrapper = node.ownerDocument!.createElement('footer');
    wrapper.appendChild(adder.node);
    wrapper.classList.add(cssClass('hierarchy-adder'));
    node.appendChild(wrapper);
  }

  private addSortAdder(ranking: Ranking, sortCriterias: ISortCriteria[], node: HTMLElement) {
    this.addAdder(
      this.sortAdder,
      ranking,
      'sort',
      sortCriterias.map((d) => d.col),
      node,
      (d) => isSortAble(d, this.ctx),
      (col) => {
        ranking.sortBy(col, isSortingAscByDefault(col), sortCriterias.length);
      }
    );
  }

  private addGroupAdder(ranking: Ranking, groups: Column[], node: HTMLElement) {
    this.addAdder(
      this.groupAdder,
      ranking,
      'group',
      groups,
      node,
      (d) => isGroupAble(d, this.ctx),
      (col) => {
        ranking.groupBy(col, groups.length);
      }
    );
  }

  private addGroupSortAdder(ranking: Ranking, sortCriterias: ISortCriteria[], node: HTMLElement) {
    this.addAdder(
      this.groupSortAdder,
      ranking,
      'sortGroup',
      sortCriterias.map((d) => d.col),
      node,
      (d) => isGroupSortAble(d, this.ctx),
      (col) => {
        ranking.groupSortBy(col, isSortingAscByDefault(col), sortCriterias.length);
      }
    );
  }

  private customize(col: Column, addons: IToolbarDialogAddon[], attachment: HTMLElement, onClick?: () => void) {
    const dialog = new AddonDialog(col, addons, dialogContext(this.ctx, 0, attachment), this.ctx, onClick);
    dialog.open();
  }
}
