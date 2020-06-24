import {IAggregationStrategy} from './interfaces';
import {IOrderedGroup, IGroup, IGroupParent, IGroupData, IGroupItem, isGroup} from '../model';
import {createIndexArray} from '../internal';

export function isAlwaysShowingGroupStrategy(strategy: IAggregationStrategy) {
  return strategy === 'group+item' || strategy === 'group+item+top' || strategy === 'group+top+item';
}

export function hasTopNStrategy(strategy: IAggregationStrategy) {
  return strategy === 'group+item+top' || strategy === 'group+top+item';
}

export declare type IGroupMeta = 'first' | 'last' | 'first last' | null;

export function toItemMeta(relativeIndex: number, group: IOrderedGroup, topN: number): IGroupMeta {
  if (relativeIndex === 0) {
    return group.order.length === 1 ? 'first last' : 'first';
  }
  if ((relativeIndex === (group.order.length - 1)) || (topN > 0 && relativeIndex === (topN - 1))) {
    return 'last';
  }
  return null;
}

export function groupParents(group: IGroup, meta: IGroupMeta) {
  const parents: {group: IGroup, meta: IGroupMeta}[] = [{group, meta}];

  let prev = group;
  let prevMeta = meta;
  let parent: IGroupParent | undefined | null = group.parent;

  while (parent) {
    if (parent.subGroups.length === 1 && (prevMeta === 'first last')) {
      meta = 'first last';
    } else if (parent.subGroups[0] === prev && (prevMeta === 'first last' || prevMeta === 'first')) {
      meta = 'first';
    } else if (parent.subGroups[parent.subGroups.length - 1] === prev && (prevMeta === 'last' || prevMeta === 'first last')) {
      meta = 'last';
    } else {
      meta = null;
    }
    parents.unshift({group: parent, meta});

    prev = parent;
    prevMeta = meta;
    parent = parent.parent;
  }
  return parents;
}

export interface ITopNGetter {
  (item: IGroup): number;
}

/**
 * number of group levels this items ends
 */
export function groupEndLevel(item: IGroupData | IGroupItem, topNGetter: ITopNGetter) {
  const group: IGroup = isGroup(item) ? item : item.group;
  const last = isGroup(item) ? 'first last' : toItemMeta(item.relativeIndex, item.group, topNGetter(group));
  if (last !== 'last' && last !== 'first last') {
    return 0;
  }

  let prev = group;
  let parent: IGroupParent | undefined | null = group.parent;
  let i = 1;

  while (parent) {
    if (!(parent.subGroups.length === 1 || (parent.subGroups[parent.subGroups.length - 1] === prev))) {
      // not last of group - end
      return i;
    }
    ++i;
    prev = parent;
    parent = parent.parent;
  }

  return i;
}

export function isSummaryGroup(group: IGroup, strategy: IAggregationStrategy, topNGetter: ITopNGetter) {
  const topN = topNGetter(group);
  return isAlwaysShowingGroupStrategy(strategy) && topN !== 0;
}

export function toRowMeta(item: IGroupData | IGroupItem, strategy: IAggregationStrategy, topNGetter: ITopNGetter): string | null {
  if (isGroup(item)) {
    if (isSummaryGroup(item, strategy, topNGetter)) {
      return 'first';
    }
    const level = groupEndLevel(item, topNGetter);
    if (level === 0) {
      return 'first';
    }
    return `first last${level === 1 ? '' : level - 1}`;
  }

  const last =  toItemMeta(item.relativeIndex, item.group, topNGetter(item.group));
  if (last == null) {
    return null;
  }
  const level = groupEndLevel(item, topNGetter);
  if (level === 0) {
    return null;
  }
  return `last${level === 1 ? '' : level - 1}`;
}

export function index2pos(groups: IOrderedGroup[], maxDataIndex: number) {
  const total = groups.reduce((a, b) => a + b.order.length, 1);
  const index2pos = createIndexArray(maxDataIndex + 1, total);
  let offset = 1;
  for (const g of groups) {
    // tslint:disable-next-line
    for (let i = 0; i < g.order.length; i++ , offset++) {
      index2pos[g.order[i]] = offset;
    }
  }

  return {groups, index2pos};
}
