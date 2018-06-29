import {Category, toolbar} from './annotations';
import CategoricalColumn from './CategoricalColumn';
import Column, {widthChanged, labelChanged, metaDataChanged, dirty, dirtyHeader, dirtyValues, rendererTypeChanged, groupRendererChanged, summaryRendererChanged, visibilityChanged} from './Column';
import {ICategoricalColumn, ICategory} from './ICategoricalColumn';
import {IDataRow, IGroup} from './interfaces';
import {colorPool} from './internal';
import {missingGroup} from './missing';
import ValueColumn, {IValueColumnDesc, dataLoaded} from './ValueColumn';
import {IEventListener} from '../internal/AEventDispatcher';

export interface ICategoryNode extends ICategory {
  children: Readonly<ICategoryNode>[];
}

export interface IPartialCategoryNode extends Partial<ICategory> {
  children: IPartialCategoryNode[];
}

export interface IHierarchyDesc {
  hierarchy: IPartialCategoryNode;
  hierarchySeparator?: string;
}

export declare type IHierarchyColumnDesc = IHierarchyDesc & IValueColumnDesc<string>;

export interface ICategoryInternalNode extends ICategory {
  path: string;
  children: Readonly<ICategoryInternalNode>[];
}

export interface ICutOffNode {
  node: Readonly<ICategoryInternalNode>;
  maxDepth: number;
}

/**
 * emitted when the cut off property changes
 * @asMemberOf HierarchyColumn
 * @event
 */
export declare function cutOffChanged(previous: ICutOffNode, current: ICutOffNode): void;

/**
 * column for hierarchical categorical values
 */
@toolbar('cutoff', 'group', 'groupBy')
@Category('categorical')
export default class HierarchyColumn extends ValueColumn<string> implements ICategoricalColumn {
  static readonly EVENT_CUTOFF_CHANGED = 'cutOffChanged';

  private readonly hierarchySeparator: string;
  readonly hierarchy: Readonly<ICategoryInternalNode>;

  private currentNode: Readonly<ICategoryInternalNode>;
  private currentMaxDepth: number = Infinity;
  private currentLeaves: Readonly<ICategoryInternalNode>[] = [];
  private readonly currentLeavesNameCache = new Map<string, Readonly<ICategoryInternalNode>>();
  private readonly currentLeavesPathCache = new Map<string, Readonly<ICategoryInternalNode>>();

  constructor(id: string, desc: Readonly<IHierarchyColumnDesc>) {
    super(id, desc);
    this.hierarchySeparator = desc.hierarchySeparator || '.';
    this.hierarchy = this.initHierarchy(desc.hierarchy);
    this.currentNode = this.hierarchy;
    this.currentLeaves = computeLeaves(this.currentNode, this.currentMaxDepth);
    this.updateCaches();

    this.setDefaultRenderer('categorical');
  }

  private initHierarchy(root: IPartialCategoryNode) {
    const colors = colorPool();
    const s = this.hierarchySeparator;
    const add = (prefix: string, node: IPartialCategoryNode): ICategoryInternalNode => {
      const name = node.name == null ? String(node.value) : node.name;
      const children = (node.children || []).map((child: IPartialCategoryNode | string): ICategoryInternalNode => {
        if (typeof child === 'string') {
          const path = prefix + child;
          return {
            path,
            name: child,
            label: path,
            color: colors(),
            value: 0,
            children: []
          };
        }
        const r = add(`${prefix}${name}${s}`, child);
        if (!r.color) {
          //hack to inject the next color
          (<any>r).color = colors();
        }
        return r;
      });
      const path = prefix + name;
      const label = node.label ? `${node.label}` : path;
      return {path, name, children, label, color: node.color!, value: 0};
    };
    return add('', root);
  }

  get categories() {
    return this.currentLeaves;
  }

  protected createEventList() {
    return super.createEventList().concat([HierarchyColumn.EVENT_CUTOFF_CHANGED]);
  }

  on(type: typeof HierarchyColumn.EVENT_CUTOFF_CHANGED, listener: typeof cutOffChanged | null): this;
  on(type: typeof ValueColumn.EVENT_DATA_LOADED, listener: typeof dataLoaded | null): this;
  on(type: typeof Column.EVENT_WIDTH_CHANGED, listener: typeof widthChanged | null): this;
  on(type: typeof Column.EVENT_LABEL_CHANGED, listener: typeof labelChanged | null): this;
  on(type: typeof Column.EVENT_METADATA_CHANGED, listener: typeof metaDataChanged | null): this;
  on(type: typeof Column.EVENT_DIRTY, listener: typeof dirty | null): this;
  on(type: typeof Column.EVENT_DIRTY_HEADER, listener: typeof dirtyHeader | null): this;
  on(type: typeof Column.EVENT_DIRTY_VALUES, listener: typeof dirtyValues | null): this;
  on(type: typeof Column.EVENT_RENDERER_TYPE_CHANGED, listener: typeof rendererTypeChanged | null): this;
  on(type: typeof Column.EVENT_GROUP_RENDERER_TYPE_CHANGED, listener: typeof groupRendererChanged | null): this;
  on(type: typeof Column.EVENT_SUMMARY_RENDERER_TYPE_CHANGED, listener: typeof summaryRendererChanged | null): this;
  on(type: typeof Column.EVENT_VISIBILITY_CHANGED, listener: typeof visibilityChanged | null): this;
  on(type: string | string[], listener: IEventListener | null): this {
    return super.on(<any>type, listener);
  }

  getCutOff(): ICutOffNode {
    return {
      node: this.currentNode,
      maxDepth: this.currentMaxDepth
    };
  }

  setCutOff(value: ICutOffNode) {
    const maxDepth = value.maxDepth == null ? Infinity : value.maxDepth;
    if (this.currentNode === value.node && this.currentMaxDepth === maxDepth) {
      return;
    }
    const bak = this.getCutOff();
    this.currentNode = value.node;
    this.currentMaxDepth = maxDepth;
    this.currentLeaves = computeLeaves(value.node, maxDepth);
    this.updateCaches();
    this.fire([HierarchyColumn.EVENT_CUTOFF_CHANGED, Column.EVENT_DIRTY_HEADER, Column.EVENT_DIRTY_VALUES, Column.EVENT_DIRTY], bak, this.getCutOff());
  }

  getCategory(row: IDataRow) {
    let v = super.getValue(row);
    if (v == null || v === '') {
      return null;
    }
    v = v.trim();
    if (this.currentLeavesNameCache.has(v)) {
      return this.currentLeavesNameCache.get(v)!;
    }
    if (this.currentLeavesPathCache.has(v)) {
      return this.currentLeavesPathCache.get(v)!;
    }
    return this.currentLeaves.find((n) => {
      //direct hit or is a child of it
      return n.path === v || n.name === v || v!.startsWith(n.path + this.hierarchySeparator);
    }) || null;
  }

  get dataLength() {
    return this.currentLeaves.length;
  }

  get labels() {
    return this.currentLeaves.map((d) => d.label);
  }

  getValue(row: IDataRow) {
    const v = this.getCategory(row);
    return v ? v.name : null;
  }

  getLabel(row: IDataRow) {
    return CategoricalColumn.prototype.getLabel.call(this, row);
  }

  getLabels(row: IDataRow) {
    return CategoricalColumn.prototype.getLabels.call(this, row);
  }

  getValues(row: IDataRow) {
    return CategoricalColumn.prototype.getValues.call(this, row);
  }

  getMap(row: IDataRow) {
    return CategoricalColumn.prototype.getMap.call(this, row);
  }

  getMapLabel(row: IDataRow) {
    return CategoricalColumn.prototype.getMapLabel.call(this, row);
  }

  getSet(row: IDataRow) {
    return CategoricalColumn.prototype.getSet.call(this, row);
  }

  compare(a: IDataRow, b: IDataRow) {
    return CategoricalColumn.prototype.compare.call(this, a, b);
  }

  group(row: IDataRow): IGroup {
    if (this.isMissing(row)) {
      return missingGroup;
    }
    const base = this.getCategory(row);
    if (!base) {
      return super.group(row);
    }
    return {name: base.label, color: base.color};
  }

  private updateCaches() {
    this.currentLeavesPathCache.clear();
    this.currentLeavesNameCache.clear();

    this.currentLeaves.forEach((n) => {
      this.currentLeavesPathCache.set(n.path, n);
      this.currentLeavesNameCache.set(n.name, n);
    });
  }
}

function computeLeaves(node: ICategoryInternalNode, maxDepth: number = Infinity) {
  const leaves: ICategoryInternalNode[] = [];
  //depth first
  const visit = (node: ICategoryInternalNode, depth: number) => {
    //hit or end
    if (depth >= maxDepth || node.children.length === 0) {
      leaves.push(node);
    } else {
      // go down
      node.children.forEach((c) => visit(c, depth + 1));
    }
  };
  visit(node, 0);
  return leaves;
}

export function resolveInnerNodes(node: ICategoryInternalNode) {
  //breath first
  const queue: ICategoryInternalNode[] = [node];
  let index = 0;
  while (index < queue.length) {
    const next = queue[index++];
    queue.push(...next.children);
  }
  return queue;
}

export function isHierarchical(categories: (string | Partial<ICategory>)[]) {
  if (categories.length === 0 || typeof categories[0] === 'string') {
    return false;
  }
  // check if any has a given parent name
  return categories.some((c) => (<any>c).parent != null);
}

export function deriveHierarchy(categories: (Partial<ICategory> & { parent: string | null })[]) {
  const lookup = new Map<string, ICategoryNode>();
  categories.forEach((c) => {
    const p = c.parent || '';
    // set and fill up proxy
    const item = Object.assign(<ICategoryNode>{
      children: [],
      label: c.name!,
      name: c.name!,
      color: Column.DEFAULT_COLOR,
      value: 0
    }, lookup.get(c.name!) || {}, c);
    lookup.set(c.name!, item);

    if (!lookup.has(p)) {
      // create proxy
      lookup.set(p, {name: p, children: [], label: p, value: 0, color: Column.DEFAULT_COLOR});
    }
    lookup.get(p)!.children.push(item);
  });
  const root = lookup.get('')!;
  console.assert(root !== undefined, 'hierarchy with no root');
  if (root.children.length === 1) {
    return root.children[0];
  }
  return root;
}
