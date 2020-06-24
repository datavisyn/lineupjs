import {AEventDispatcher, debounce, ISequence, OrderedSet, IDebounceContext, IEventListener, suffix, IEventContext} from '../internal';
import {Column, IColumnConstructor, Ranking, AggregateGroupColumn, createAggregateDesc, IAggregateGroupColumnDesc, isSupportType, EDirtyReason, RankColumn, createRankDesc, createSelectionDesc, IColumnDesc, IDataRow, IGroup, IndicesArray, IOrderedGroup, ISelectionColumnDesc, EAggregationState, INumberColumn, IColumnDump, IRankingDump, IColorMappingFunctionConstructor, IMappingFunctionConstructor, ITypeFactory} from '../model';
import {models} from '../model/models';
import {forEachIndices, everyIndices, toGroupID, unifyParents} from '../model/internal';
import {IDataProvider, IDataProviderDump, IDataProviderOptions, SCHEMA_REF, IExportOptions} from './interfaces';
import {exportRanking, map2Object, object2Map} from './utils';
import {IRenderTasks} from '../renderer';
import {restoreCategoricalColorMapping} from '../model/CategoricalColorMappingFunction';
import {createColorMappingFunction, colorMappingFunctions} from '../model/ColorMappingFunction';
import {createMappingFunction, mappingFunctions} from '../model/MappingFunction';



/**
 * emitted when a column has been added
 * @asMemberOf ADataProvider
 * @event
 */
export declare function addColumn(col: Column, index: number): void;

/**
 * emitted when a column has been moved within this composite columm
 * @asMemberOf ADataProvider
 * @event
 */
export declare function moveColumn(col: Column, index: number, oldIndex: number): void;

/**
 * emitted when a column has been removed
 * @asMemberOf ADataProvider
 * @event
 */
export declare function removeColumn(col: Column, index: number): void;
/**
 * @asMemberOf ADataProvider
 * @event
 */
export declare function orderChanged(previous: number[], current: number[], previousGroups: IOrderedGroup[], currentGroups: IOrderedGroup[], dirtyReason: EDirtyReason[]): void;


/**
 * emitted when state of the column is dirty
 * @asMemberOf ADataProvider
 * @event
 */
export declare function dirty(): void;

/**
 * emitted when state of the column related to its header is dirty
 * @asMemberOf ADataProvider
 * @event
 */
export declare function dirtyHeader(): void;

/**
 * emitted when state of the column related to its values is dirty
 * @asMemberOf ADataProvider
 * @event
 */
export declare function dirtyValues(): void;

/**
 * emitted when state of the column related to cached values (hist, compare, ...) is dirty
 * @asMemberOf ADataProvider
 * @event
 */
export declare function dirtyCaches(): void;


/**
 * emitted when the data changes
 * @asMemberOf ADataProvider
 * @param rows the new data rows
 * @event
 */
export declare function dataChanged(rows: IDataRow[]): void;

/**
 * emitted when the selection changes
 * @asMemberOf ADataProvider
 * @param dataIndices the selected data indices
 * @event
 */
export declare function selectionChanged(dataIndices: number[]): void;
/**
 * @asMemberOf ADataProvider
 * @event
 */
export declare function addRanking(ranking: Ranking, index: number): void;
/**
 * @asMemberOf ADataProvider
 * @param ranking if null all rankings are removed else just the specific one
 * @event
 */
export declare function removeRanking(ranking: Ranking | null, index: number): void;

/**
 * @asMemberOf ADataProvider
 * @event
 */
export declare function addDesc(desc: IColumnDesc): void;
/**
 * @asMemberOf ADataProvider
 * @event
 */
export declare function clearDesc(): void;

/**
 * @asMemberOf ADataProvider
 * @event
 */
export declare function showTopNChanged(previous: number, current: number): void;

/**
 * emitted when the selection changes
 * @asMemberOf ADataProvider
 * @param dataIndices the selected data indices
 * @event
 */
export declare function jumpToNearest(dataIndices: number[]): void;
/**
 * @asMemberOf ADataProvider
 * @event
 */
export declare function aggregate(ranking: Ranking, group: IGroup | IGroup[], value: boolean, state: EAggregationState): void;


/**
 * @asMemberOf ADataProvider
 * @event
 */
export declare function busy(busy: boolean): void;

function toDirtyReason(ctx: IEventContext) {
  const primary = ctx.primaryType;
  switch (primary || '') {
    case Ranking.EVENT_DIRTY_ORDER:
      return ctx.args[0] || [EDirtyReason.UNKNOWN];
    case Ranking.EVENT_SORT_CRITERIA_CHANGED:
      return [EDirtyReason.SORT_CRITERIA_CHANGED];
    case Ranking.EVENT_GROUP_CRITERIA_CHANGED:
      return [EDirtyReason.GROUP_CRITERIA_CHANGED];
    case Ranking.EVENT_GROUP_SORT_CRITERIA_CHANGED:
      return [EDirtyReason.GROUP_SORT_CRITERIA_CHANGED];
    default:
      return [EDirtyReason.UNKNOWN];
  }
}

function mergeDirtyOrderContext(current: IDebounceContext, next: IDebounceContext) {
  const currentReason = toDirtyReason(current.self);
  const nextReason = toDirtyReason(next.self);
  const combined = new Set(currentReason);
  for (const r of nextReason) {
    combined.add(r);
  }
  const args = [Array.from(combined)];
  return {
    self: {
      primaryType: Ranking.EVENT_DIRTY_ORDER,
      args
    },
    args
  };
}

/**
 * a basic data provider holding the data and rankings
 */
abstract class ADataProvider extends AEventDispatcher implements IDataProvider {
  static readonly EVENT_SELECTION_CHANGED = 'selectionChanged';
  static readonly EVENT_DATA_CHANGED = 'dataChanged';
  static readonly EVENT_ADD_COLUMN = Ranking.EVENT_ADD_COLUMN;
  static readonly EVENT_MOVE_COLUMN = Ranking.EVENT_MOVE_COLUMN;
  static readonly EVENT_REMOVE_COLUMN = Ranking.EVENT_REMOVE_COLUMN;
  static readonly EVENT_ADD_RANKING = 'addRanking';
  static readonly EVENT_REMOVE_RANKING = 'removeRanking';
  static readonly EVENT_DIRTY = Ranking.EVENT_DIRTY;
  static readonly EVENT_DIRTY_HEADER = Ranking.EVENT_DIRTY_HEADER;
  static readonly EVENT_DIRTY_VALUES = Ranking.EVENT_DIRTY_VALUES;
  static readonly EVENT_DIRTY_CACHES = Ranking.EVENT_DIRTY_CACHES;
  static readonly EVENT_ORDER_CHANGED = Ranking.EVENT_ORDER_CHANGED;
  static readonly EVENT_SHOWTOPN_CHANGED = 'showTopNChanged';
  static readonly EVENT_ADD_DESC = 'addDesc';
  static readonly EVENT_CLEAR_DESC = 'clearDesc';
  static readonly EVENT_JUMP_TO_NEAREST = 'jumpToNearest';
  static readonly EVENT_GROUP_AGGREGATION_CHANGED = AggregateGroupColumn.EVENT_AGGREGATE;
  static readonly EVENT_BUSY = 'busy';

  private static readonly FORWARD_RANKING_EVENTS = suffix('.provider', Ranking.EVENT_ADD_COLUMN, Ranking.EVENT_REMOVE_COLUMN,
    Ranking.EVENT_DIRTY, Ranking.EVENT_DIRTY_HEADER, Ranking.EVENT_MOVE_COLUMN,
    Ranking.EVENT_ORDER_CHANGED, Ranking.EVENT_DIRTY_VALUES, Ranking.EVENT_DIRTY_CACHES);

  /**
   * all rankings
   * @type {Array}
   * @private
   */
  private readonly rankings: Ranking[] = [];

  /**
   * the current selected indices
   * @type {OrderedSet}
   */
  private readonly selection = new OrderedSet<number>();

  //Map<ranking.id@group.name, -1=expand,0=collapse,N=topN>
  private readonly aggregations = new Map<string, number>(); // not part of = show all

  private uid = 0;
  private readonly typeFactory: ITypeFactory;

  private readonly options: Readonly<IDataProviderOptions> = {
    columnTypes: {},
    colorMappingFunctionTypes: {},
    mappingFunctionTypes: {},
    singleSelection: false,
    showTopN: 10,
    aggregationStrategy: 'item'
  };

  /**
   * lookup map of a column type to its column implementation
   */
  readonly columnTypes: {[columnType: string]: IColumnConstructor};
  readonly colorMappingFunctionTypes: {[colorMappingFunctionType: string]: IColorMappingFunctionConstructor};
  readonly mappingFunctionTypes: {[mappingFunctionType: string]: IMappingFunctionConstructor};

  private showTopN: number;

  constructor(options: Partial<IDataProviderOptions> = {}) {
    super();
    Object.assign(this.options, options);
    this.columnTypes = Object.assign(models(), this.options.columnTypes);
    this.colorMappingFunctionTypes = Object.assign(colorMappingFunctions(), this.options.colorMappingFunctionTypes);
    this.mappingFunctionTypes = Object.assign(mappingFunctions(), this.options.mappingFunctionTypes);
    this.showTopN = this.options.showTopN;

    this.typeFactory = this.createTypeFactory();
  }

  private createTypeFactory() {
    const factory = <ITypeFactory><any>((d: IColumnDump) => {
      const desc = this.fromDescRef(d.desc);
      if (!desc || !desc.type) {
        console.warn('cannot restore column dump', d);
        return new Column(d.id || '', d.desc || {});
      }
      this.fixDesc(desc);
      const type = this.columnTypes[desc.type];
      if (type == null) {
        console.warn('invalid column type in column dump using column', d);
        return new Column(d.id || '', desc);
      }
      const c = this.instantiateColumn(type, '', desc, this.typeFactory);
      c.restore(d, factory);
      return c;
    });
    factory.colorMappingFunction = createColorMappingFunction(this.colorMappingFunctionTypes, factory);
    factory.mappingFunction = createMappingFunction(this.mappingFunctionTypes);
    factory.categoricalColorMappingFunction = restoreCategoricalColorMapping;
    return factory;
  }

  getTypeFactory() {
    return this.typeFactory;
  }

  /**
   * events:
   *  * column changes: addColumn, removeColumn
   *  * ranking changes: addRanking, removeRanking
   *  * dirty: dirty, dirtyHeder, dirtyValues
   *  * selectionChanged
   * @returns {string[]}
   */
  protected createEventList() {
    return super.createEventList().concat([
      ADataProvider.EVENT_DATA_CHANGED, ADataProvider.EVENT_BUSY,
      ADataProvider.EVENT_SHOWTOPN_CHANGED,
      ADataProvider.EVENT_ADD_COLUMN, ADataProvider.EVENT_REMOVE_COLUMN, ADataProvider.EVENT_MOVE_COLUMN,
      ADataProvider.EVENT_ADD_RANKING, ADataProvider.EVENT_REMOVE_RANKING,
      ADataProvider.EVENT_DIRTY, ADataProvider.EVENT_DIRTY_HEADER, ADataProvider.EVENT_DIRTY_VALUES, ADataProvider.EVENT_DIRTY_CACHES,
      ADataProvider.EVENT_ORDER_CHANGED, ADataProvider.EVENT_SELECTION_CHANGED,
      ADataProvider.EVENT_ADD_DESC, ADataProvider.EVENT_CLEAR_DESC,
      ADataProvider.EVENT_JUMP_TO_NEAREST, ADataProvider.EVENT_GROUP_AGGREGATION_CHANGED]);
  }

  on(type: typeof ADataProvider.EVENT_BUSY, listener: typeof busy | null): this;
  on(type: typeof ADataProvider.EVENT_DATA_CHANGED, listener: typeof dataChanged | null): this;
  on(type: typeof ADataProvider.EVENT_SHOWTOPN_CHANGED, listener: typeof showTopNChanged | null): this;
  on(type: typeof ADataProvider.EVENT_ADD_COLUMN, listener: typeof addColumn | null): this;
  on(type: typeof ADataProvider.EVENT_MOVE_COLUMN, listener: typeof moveColumn | null): this;
  on(type: typeof ADataProvider.EVENT_REMOVE_COLUMN, listener: typeof removeColumn | null): this;
  on(type: typeof ADataProvider.EVENT_ADD_RANKING, listener: typeof addRanking | null): this;
  on(type: typeof ADataProvider.EVENT_REMOVE_RANKING, listener: typeof removeRanking | null): this;
  on(type: typeof ADataProvider.EVENT_DIRTY, listener: typeof dirty | null): this;
  on(type: typeof ADataProvider.EVENT_DIRTY_HEADER, listener: typeof dirtyHeader | null): this;
  on(type: typeof ADataProvider.EVENT_DIRTY_VALUES, listener: typeof dirtyValues | null): this;
  on(type: typeof ADataProvider.EVENT_DIRTY_CACHES, listener: typeof dirtyCaches | null): this;
  on(type: typeof ADataProvider.EVENT_ORDER_CHANGED, listener: typeof orderChanged | null): this;
  on(type: typeof ADataProvider.EVENT_ADD_DESC, listener: typeof addDesc | null): this;
  on(type: typeof ADataProvider.EVENT_CLEAR_DESC, listener: typeof clearDesc | null): this;
  on(type: typeof ADataProvider.EVENT_JUMP_TO_NEAREST, listener: typeof jumpToNearest | null): this;
  on(type: typeof ADataProvider.EVENT_GROUP_AGGREGATION_CHANGED, listener: typeof aggregate | null): this;
  on(type: typeof ADataProvider.EVENT_SELECTION_CHANGED, listener: typeof selectionChanged | null): this;
  on(type: string | string[], listener: IEventListener | null): this; // required for correct typings in *.d.ts
  on(type: string | string[], listener: IEventListener | null): this {
    return super.on(type, listener);
  }

  abstract getTotalNumberOfRows(): number;

  /**
   * returns a list of all known column descriptions
   * @returns {Array}
   */
  abstract getColumns(): IColumnDesc[];

  abstract getTaskExecutor(): IRenderTasks;

  /**
   * adds a new ranking
   * @param existing an optional existing ranking to clone
   * @return the new ranking
   */
  pushRanking(existing?: Ranking): Ranking {
    const r = this.cloneRanking(existing);

    this.insertRanking(r);
    return r;
  }

  protected fireBusy(busy: boolean) {
    this.fire(ADataProvider.EVENT_BUSY, busy);
  }

  takeSnapshot(col: Column): Ranking {
    this.fireBusy(true);
    const r = this.cloneRanking();
    const ranking = col.findMyRanker();
    // by convention copy all support types and the first string column
    let hasString = col.desc.type === 'string';
    let hasColumn = false;
    const toClone = !ranking ? [col] : ranking.children.filter((c) => {
      if (c === col) {
        hasColumn = true;
        return true;
      }
      if (!hasString && c.desc.type === 'string') {
        hasString = true;
        return true;
      }
      return isSupportType(c);
    });

    if (!hasColumn) {
      // maybe a nested one thus not in the top level
      toClone.push(col);
    }

    toClone.forEach((c) => {
      const clone = this.clone(c);
      r.push(clone);
      if (c === col) {
        clone.sortByMe();
      }
    });
    this.insertRanking(r);
    this.fireBusy(false);
    return r;
  }

  insertRanking(r: Ranking, index = this.rankings.length) {
    this.rankings.splice(index, 0, r);
    this.forward(r, ...ADataProvider.FORWARD_RANKING_EVENTS);
    //delayed reordering per ranking
    const that = this;
    r.on(`${Ranking.EVENT_DIRTY_ORDER}.provider`, debounce(function(this: IEventContext) {
      that.triggerReorder(r, toDirtyReason(this));
    }, 100, mergeDirtyOrderContext));
    this.fire([ADataProvider.EVENT_ADD_RANKING, ADataProvider.EVENT_DIRTY_HEADER, ADataProvider.EVENT_DIRTY_VALUES, ADataProvider.EVENT_DIRTY], r, index);
    this.triggerReorder(r);
  }

  private triggerReorder(ranking: Ranking, dirtyReason?: EDirtyReason[]) {
    this.fireBusy(true);
    const reason = dirtyReason || [EDirtyReason.UNKNOWN];
    Promise.resolve(this.sort(ranking, reason)).then(({groups, index2pos}) => {
      groups = unifyParents(groups);
      this.initAggregateState(ranking, groups);
      ranking.setGroups(groups, index2pos, reason);
      this.fireBusy(false);
    });
  }

  /**
   * removes a ranking from this data provider
   * @param ranking
   * @returns {boolean}
   */
  removeRanking(ranking: Ranking) {
    const i = this.rankings.indexOf(ranking);
    if (i < 0) {
      return false;
    }
    this.unforward(ranking, ...ADataProvider.FORWARD_RANKING_EVENTS);
    this.rankings.splice(i, 1);
    ranking.on(`${Ranking.EVENT_DIRTY_ORDER}.provider`, null);
    this.cleanUpRanking(ranking);
    this.fire([ADataProvider.EVENT_REMOVE_RANKING, ADataProvider.EVENT_DIRTY_HEADER, ADataProvider.EVENT_DIRTY_VALUES, ADataProvider.EVENT_DIRTY], ranking, i);
    return true;
  }

  /**
   * removes all rankings
   */
  clearRankings() {
    this.rankings.forEach((ranking) => {
      this.unforward(ranking, ...ADataProvider.FORWARD_RANKING_EVENTS);
      ranking.on(`${Ranking.EVENT_DIRTY_ORDER}.provider`, null);
      this.cleanUpRanking(ranking);
    });
    // clear
    this.rankings.splice(0, this.rankings.length);
    this.fire([ADataProvider.EVENT_REMOVE_RANKING, ADataProvider.EVENT_DIRTY_HEADER, ADataProvider.EVENT_DIRTY_VALUES, ADataProvider.EVENT_DIRTY], null, -1);
  }

  clearFilters() {
    this.rankings.forEach((ranking) => ranking.clearFilters());
  }

  /**
   * returns a list of all current rankings
   * @returns {Ranking[]}
   */
  getRankings() {
    return this.rankings.slice();
  }

  /**
   * returns the last ranking for quicker access
   * @returns {Ranking}
   */
  getFirstRanking() {
    return this.rankings[0] || null;
  }

  /**
   * returns the last ranking for quicker access
   * @returns {Ranking}
   */
  getLastRanking() {
    return this.rankings[this.rankings.length - 1];
  }

  ensureOneRanking() {
    if (this.rankings.length === 0) {
      const r = this.pushRanking();
      this.push(r, createRankDesc());
    }
  }

  destroy() {
    // dummy
  }

  /**
   * hook method for cleaning up a ranking
   * @param _ranking
   */
  cleanUpRanking(_ranking: Ranking) {
    // dummy
  }

  /**
   * abstract method for cloning a ranking
   * @param existing
   * @returns {null}
   */
  abstract cloneRanking(existing?: Ranking): Ranking;

  /**
   * adds a column to a ranking described by its column description
   * @param ranking the ranking to add the column to
   * @param desc the description of the column
   * @return {Column} the newly created column or null
   */
  push(ranking: Ranking, desc: IColumnDesc): Column | null {
    const r = this.create(desc);
    if (r) {
      ranking.push(r);
      return r;
    }
    return null;
  }

  /**
   * adds a column to a ranking described by its column description
   * @param ranking the ranking to add the column to
   * @param index the position to insert the column
   * @param desc the description of the column
   * @return {Column} the newly created column or null
   */
  insert(ranking: Ranking, index: number, desc: IColumnDesc) {
    const r = this.create(desc);
    if (r) {
      ranking.insert(r, index);
      return r;
    }
    return null;
  }

  /**
   * creates a new unique id for a column
   * @returns {string}
   */
  private nextId() {
    return `col${this.uid++}`;
  }

  private fixDesc(desc: IColumnDesc) {
    //hacks for provider dependent descriptors
    if (desc.type === 'selection') {
      (<ISelectionColumnDesc>desc).accessor = (row: IDataRow) => this.isSelected(row.i);
      (<ISelectionColumnDesc>desc).setter = (index: number, value: boolean) => value ? this.select(index) : this.deselect(index);
      (<ISelectionColumnDesc>desc).setterAll = (indices: IndicesArray, value: boolean) => value ? this.selectAll(indices) : this.deselectAll(indices);
    } else if (desc.type === 'aggregate') {
      (<IAggregateGroupColumnDesc>desc).isAggregated = (ranking: Ranking, group: IGroup) => this.getAggregationState(ranking, group);
      (<IAggregateGroupColumnDesc>desc).setAggregated = (ranking: Ranking, group: IGroup, value: EAggregationState) => this.setAggregationState(ranking, group, value);
    }
    return desc;
  }

  protected cleanDesc(desc: IColumnDesc) {
    //hacks for provider dependent descriptors
    if (desc.type === 'selection') {
      delete (<ISelectionColumnDesc>desc).accessor;
      delete (<ISelectionColumnDesc>desc).setter;
      delete (<ISelectionColumnDesc>desc).setterAll;
    } else if (desc.type === 'aggregate') {
      delete (<IAggregateGroupColumnDesc>desc).isAggregated;
      delete (<IAggregateGroupColumnDesc>desc).setAggregated;
    }
    return desc;
  }

  /**
   * creates an internal column model out of the given column description
   * @param desc
   * @returns {Column} the new column or null if it can't be created
   */
  create(desc: IColumnDesc): Column | null {
    this.fixDesc(desc);
    //find by type and instantiate
    const type = this.columnTypes[desc.type];
    if (type) {
      return this.instantiateColumn(type, this.nextId(), desc, this.typeFactory);
    }
    return null;
  }

  protected instantiateColumn(type: IColumnConstructor, id: string, desc: IColumnDesc, typeFactory: ITypeFactory) {
    return new type(id, desc, typeFactory);
  }

  /**
   * clones a column by dumping and restoring
   * @param col
   * @returns {Column}
   */
  clone(col: Column) {
    const dump = this.dumpColumn(col);
    return this.restoreColumn(dump);
  }

  /**
   * restores a column from a dump
   * @param dump
   * @returns {Column}
   */
  restoreColumn(dump: any): Column {
    const c = this.typeFactory(dump);
    c.assignNewId(this.nextId.bind(this));
    return c;
  }

  /**
   * finds a column in all rankings returning the first match
   * @param idOrFilter by id or by a filter function
   * @returns {Column}
   */
  find(idOrFilter: string | ((col: Column) => boolean)): Column | null {
    //convert to function
    const filter = typeof (idOrFilter) === 'string' ? (col: Column) => col.id === idOrFilter : idOrFilter;

    for (const ranking of this.rankings) {
      const r = ranking.find(filter);
      if (r) {
        return r;
      }
    }
    return null;
  }


  /**
   * dumps this whole provider including selection and the rankings
   * @returns {{uid: number, selection: number[], rankings: *[]}}
   */
  dump(): IDataProviderDump {
    return {
      '$schema': SCHEMA_REF,
      uid: this.uid,
      selection: this.getSelection(),
      aggregations: map2Object(this.aggregations),
      rankings: this.rankings.map((r) => r.dump(this.toDescRef)),
      showTopN: this.showTopN
    };
  }

  /**
   * dumps a specific column
   */
  dumpColumn(col: Column): IColumnDump {
    return col.dump(this.toDescRef);
  }

  /**
   * for better dumping describe reference, by default just return the description
   */
  toDescRef = (desc: any): any => desc;

  /**
   * inverse operation of toDescRef
   */
  fromDescRef = (descRef: any): any => descRef;

  restoreRanking(dump: IRankingDump) {
    const ranking = this.cloneRanking();
    ranking.restore(dump, this.typeFactory);
    const idGenerator = this.nextId.bind(this);
    ranking.children.forEach((c) => c.assignNewId(idGenerator));
    return ranking;
  }

  restore(dump: IDataProviderDump) {
    //clean old
    this.clearRankings();

    //restore selection
    this.uid = dump.uid || 0;
    if (dump.selection) {
      dump.selection.forEach((s: number) => this.selection.add(s));
    }
    if (dump.showTopN != null) {
      this.showTopN = dump.showTopN;
    }
    if (dump.aggregations) {
      this.aggregations.clear();
      if (Array.isArray(dump.aggregations)) {
        dump.aggregations.forEach((a: string) => this.aggregations.set(a, 0));
      } else {
        object2Map(dump.aggregations).forEach((v, k) => this.aggregations.set(k, v));
      }
    }


    //restore rankings
    if (dump.rankings) {
      dump.rankings.forEach((r: any) => {
        const ranking = this.cloneRanking();
        ranking.restore(r, this.typeFactory);
        //if no rank column add one
        if (!ranking.children.some((d) => d instanceof RankColumn)) {
          ranking.insert(this.create(createRankDesc())!, 0);
        }
        this.insertRanking(ranking);
      });
    }

    //assign new ids
    const idGenerator = this.nextId.bind(this);
    this.rankings.forEach((r) => {
      r.children.forEach((c) => c.assignNewId(idGenerator));
    });
  }

  abstract findDesc(ref: string): IColumnDesc | null;

  /**
   * generates a default ranking by using all column descriptions ones
   */
  deriveDefault(addSupportType: boolean = true) {
    const r = this.pushRanking();
    if (addSupportType) {
      r.push(this.create(createAggregateDesc())!);
      r.push(this.create(createRankDesc())!);
      if (this.options.singleSelection !== false) {
        r.push(this.create(createSelectionDesc())!);
      }
    }
    this.getColumns().forEach((col) => {
      const c = this.create(col);
      if (!c || isSupportType(c)) {
        return;
      }
      r.push(c);
    });
    return r;
  }

  isAggregated(ranking: Ranking, group: IGroup) {
    return this.getTopNAggregated(ranking, group) >= 0;
  }

  getAggregationState(ranking: Ranking, group: IGroup) {
    const n = this.getTopNAggregated(ranking, group);
    return n < 0 ? EAggregationState.EXPAND : (n === 0 ? EAggregationState.COLLAPSE : EAggregationState.EXPAND_TOP_N);
  }

  setAggregated(ranking: Ranking, group: IGroup, value: boolean) {
    return this.setAggregationState(ranking, group, value ? EAggregationState.COLLAPSE : EAggregationState.EXPAND);
  }

  setAggregationState(ranking: Ranking, group: IGroup, value: EAggregationState) {
    this.setTopNAggregated(ranking, group, value === EAggregationState.COLLAPSE ? 0 : (value === EAggregationState.EXPAND_TOP_N ? this.showTopN  : -1));
  }

  getTopNAggregated(ranking: Ranking, group: IGroup) {
    let g: IGroup | undefined | null = group;
    while (g) {
      const key = `${ranking.id}@${toGroupID(g)}`;
      if (this.aggregations.has(key)) {
        // propagate to leaf
        const v = this.aggregations.get(key)!;
        this.aggregations.set(`${ranking.id}@${toGroupID(group)}`, v);
        return v;
      }
      g = g.parent;
    }
    return -1;
  }

  private unaggregateParents(ranking: Ranking, group: IGroup) {
    let g: IGroup | undefined | null = group.parent;
    while (g) {
      this.aggregations.delete(`${ranking.id}@${toGroupID(g)}`);
      g = g.parent;
    }
  }

  getAggregationStrategy() {
    return this.options.aggregationStrategy;
  }

  private initAggregateState(ranking: Ranking, groups: IGroup[]) {
    let initial = -1;
    switch(this.getAggregationStrategy()) {
      case 'group':
        initial = 0;
        break;
      case 'item':
      case 'group+item':
      case 'group+item+top':
        initial = -1;
        break;
      case 'group+top+item':
        initial = this.showTopN;
        break;
    }

    for (const group of groups) {
      const key = `${ranking.id}@${toGroupID(group)}`;
      if (!this.aggregations.has(key) && initial >= 0) {
        this.aggregations.set(key, initial);
      }
    }
  }

  setTopNAggregated(ranking: Ranking, group: IGroup, value: number) {
    this.unaggregateParents(ranking, group);
    const key = `${ranking.id}@${toGroupID(group)}`;
    const current = this.getTopNAggregated(ranking, group);
    if (current === value) {
      return;
    }
    if (value >= 0) {
      this.aggregations.set(key, value);
    } else {
      this.aggregations.delete(key);
    }
    this.fire([ADataProvider.EVENT_GROUP_AGGREGATION_CHANGED, ADataProvider.EVENT_DIRTY_VALUES, ADataProvider.EVENT_DIRTY], ranking, group, value);
  }

  aggregateAllOf(ranking: Ranking, aggregateAll: boolean | number | EAggregationState, groups = ranking.getGroups()) {
    let v: number;
    if (typeof aggregateAll === 'boolean') {
      v = aggregateAll ? 0 : -1;
    } else if (aggregateAll === EAggregationState.COLLAPSE) {
      v = 0;
    } else if (aggregateAll === EAggregationState.EXPAND) {
      v = -1;
    } else if (aggregateAll === EAggregationState.EXPAND_TOP_N) {
      v = this.showTopN;
    } else {
      v = aggregateAll;
    }

    for(const group of groups) {
      this.unaggregateParents(ranking, group);
      const current = this.getTopNAggregated(ranking, group);
      if (current === v) {
        continue;
      }
      const key = `${ranking.id}@${toGroupID(group)}`;
      if (v >= 0) {
        this.aggregations.set(key, v);
      } else {
        this.aggregations.delete(key);
      }
    }
    this.fire([ADataProvider.EVENT_GROUP_AGGREGATION_CHANGED, ADataProvider.EVENT_DIRTY_VALUES, ADataProvider.EVENT_DIRTY], ranking, groups, v >= 0, v);
  }

  getShowTopN() {
    return this.showTopN;
  }

  setShowTopN(value: number) {
    if (this.showTopN === value) {
      return;
    }
    // update entries
    for (const [k, v] of Array.from(this.aggregations.entries())) {
      if (v === this.showTopN) {
        this.aggregations.set(k, value);
      }
    }
    this.fire([ADataProvider.EVENT_SHOWTOPN_CHANGED, ADataProvider.EVENT_DIRTY_VALUES, ADataProvider.EVENT_DIRTY], this.showTopN, this.showTopN = value);
  }

  /**
   * sorts the given ranking and eventually return a ordering of the data items
   * @param ranking
   * @return {Promise<any>}
   */
  abstract sort(ranking: Ranking, dirtyReason: EDirtyReason[]): Promise<{groups: IOrderedGroup[], index2pos: IndicesArray}> | {groups: IOrderedGroup[], index2pos: IndicesArray};

  /**
   * returns a view in the order of the given indices
   * @param indices
   * @return {Promise<any>}
   */
  abstract view(indices: IndicesArray): Promise<any[]> | any[];


  abstract getRow(index: number): Promise<IDataRow> | IDataRow;

  /**
   * returns a data sample used for the mapping editor
   * @param col
   * @return {Promise<any>}
   */
  abstract mappingSample(col: INumberColumn): Promise<ISequence<number>> | ISequence<number>;

  /**
   * is the given row selected
   * @param index
   * @return {boolean}
   */
  isSelected(index: number) {
    return this.selection.has(index);
  }

  /**
   * also select the given row
   * @param index
   */
  select(index: number) {
    if (this.selection.has(index)) {
      return; //no change
    }
    if (this.options.singleSelection === true && this.selection.size > 0) {
      this.selection.clear();
    }
    this.selection.add(index);
    this.fire(ADataProvider.EVENT_SELECTION_CHANGED, this.getSelection());
  }

  /**
   * hook for selecting elements matching the given arguments
   * @param search
   * @param col
   */
  abstract searchAndJump(search: string | RegExp, col: Column): void;

  jumpToNearest(indices: number[]) {
    if (indices.length === 0) {
      return;
    }
    this.fire(ADataProvider.EVENT_JUMP_TO_NEAREST, indices);
  }

  /**
   * also select all the given rows
   * @param indices
   */
  selectAll(indices: IndicesArray) {
    if (everyIndices(indices, (i) => this.selection.has(i))) {
      return; //no change
    }
    if (this.options.singleSelection === true) {
      this.selection.clear();
      if (indices.length > 0) {
        this.selection.add(indices[0]);
      }
    } else {
      forEachIndices(indices, (index) => {
        this.selection.add(index);
      });
    }
    this.fire(ADataProvider.EVENT_SELECTION_CHANGED, this.getSelection());
  }

  selectAllOf(ranking: Ranking) {
    this.setSelection(Array.from(ranking.getOrder()));
  }

  /**
   * set the selection to the given rows
   * @param indices
   */
  setSelection(indices: number[]) {
    if (indices.length === 0) {
      return this.clearSelection();
    }
    if (this.selection.size === indices.length && indices.every((i) => this.selection.has(i))) {
      return; //no change
    }
    this.selection.clear();
    this.selectAll(indices);
  }

  /**
   * toggles the selection of the given data index
   * @param index
   * @param additional just this element or all
   * @returns {boolean} whether the index is currently selected
   */
  toggleSelection(index: number, additional = false) {
    if (this.isSelected(index)) {
      if (additional) {
        this.deselect(index);
      } else {
        this.clearSelection();
      }
      return false;
    }
    if (additional) {
      this.select(index);
    } else {
      this.setSelection([index]);
    }
    return true;
  }

  /**
   * deselect the given row
   * @param index
   */
  deselect(index: number) {
    if (!this.selection.has(index)) {
      return; //no change
    }
    this.selection.delete(index);
    this.fire(ADataProvider.EVENT_SELECTION_CHANGED, this.getSelection());
  }

  /**
   * also select all the given rows
   * @param indices
   */
  deselectAll(indices: IndicesArray) {
    if (everyIndices(indices, (i) => !this.selection.has(i))) {
      return; //no change
    }
    forEachIndices(indices, (index) => {
      this.selection.delete(index);
    });
    this.fire(ADataProvider.EVENT_SELECTION_CHANGED, this.getSelection());
  }

  /**
   * returns a promise containing the selected rows
   * @return {Promise<any[]>}
   */
  selectedRows(): Promise<any[]> | any[] {
    if (this.selection.size === 0) {
      return [];
    }
    return this.view(this.getSelection());
  }

  /**
   * returns the currently selected indices
   * @returns {Array}
   */
  getSelection() {
    return Array.from(this.selection);
  }

  /**
   * clears the selection
   */
  clearSelection() {
    if (this.selection.size === 0) {
      return; //no change
    }
    this.selection.clear();
    this.fire(ADataProvider.EVENT_SELECTION_CHANGED, [], false);
  }

  /**
   * utility to export a ranking to a table with the given separator
   * @param ranking
   * @param options
   * @returns {Promise<string>}
   */
  exportTable(ranking: Ranking, options: Partial<IExportOptions> = {}) {
    return Promise.resolve(this.view(ranking.getOrder())).then((data) => exportRanking(ranking, data, options));
  }
}

export default ADataProvider;
