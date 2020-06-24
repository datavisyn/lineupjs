LineUp.js: Visual Analysis of Multi-Attribute Rankings
======================================================
[![License][bsd-image]][bsd-url] [![NPM version][npm-image]][npm-url] [![CircleCI][ci-image]][ci-url] [![CircleCI][ci-image-dev]][ci-url-dev] <sup>(dev)</sup>

LineUp is an interactive technique designed to create, visualize and explore rankings of items based on a set of heterogeneous attributes.

Key Features
-----------
 * scalable (~1M rows)
 * heterogenous attribute types (string, numerical, categorical, boolean, date)
 * composite column types (weighted sum, min, max, mean, median, impose, nested, ...)
 * array (multi value) and map column types (strings, stringMap, numbers, numberMap, ...)
 * filtering capabilities
 * hierarchical sorting (sort by more than one sorting criteria)
 * hierarchical grouping (split rows in multiple separate groups)
 * group aggregations (show a whole group as a single group row)
 * numerous visualizations for summaries, cells, and group aggregations
 * side panel for easy filtering and column management
 * [React](#react), [Angular](#angular), [Vue.js](#vue), [Polymer](#polymer), [RShiny](#rshiny), [Juypter](#jupyter), [ObservableHQ](#observablehq), and [Power BI](#powerbi) wrapper
 * [Demo Application](#demo) with CSV import and export capabilities
 * [API Documentation](#api) based on generated TypeDoc documenation

Usage
-----

**Installation**

```bash
npm install --save lineupjs
```

```html
<link href="https://unpkg.com/lineupjs/build/LineUpJS.css" rel="stylesheet">
<script src="https://unpkg.com/lineupjs/build/LineUpJS.js"></script>
```

**Minimal Usage Example**

```javascript
// generate some data
const arr = [];
const cats = ['c1', 'c2', 'c3'];
for (let i = 0; i < 100; ++i) {
  arr.push({
    a: Math.random() * 10,
    d: 'Row ' + i,
    cat: cats[Math.floor(Math.random() * 3)],
    cat2: cats[Math.floor(Math.random() * 3)]
  })
}
```
```javascript
const lineup = LineUpJS.asLineUp(document.body, arr);
```

[CodePen](https://codepen.io/sgratzl/pen/Ozzbqp)

[![Minimal Result](https://user-images.githubusercontent.com/4129778/34654173-32180ff8-f3f8-11e7-8469-229fa34a65dc.png)](https://codepen.io/sgratzl/pen/Ozzbqp)


<a id="advanced_usage_example"></a>

**Advanced Usage Example**

```javascript
// arr from before
const builder = LineUpJS.builder(arr);

// manually define columns
builder
  .column(LineUpJS.buildStringColumn('d').label('Label').width(100))
  .column(LineUpJS.buildCategoricalColumn('cat', cats).color('green'))
  .column(LineUpJS.buildCategoricalColumn('cat2', cats).color('blue'))
  .column(LineUpJS.buildNumberColumn('a', [0, 10]).color('blue'));

// and two rankings
const ranking = LineUpJS.buildRanking()
  .supportTypes()
  .allColumns() // add all columns
  .impose('a+cat', 'a', 'cat2'); // create composite column
  .groupBy('cat')
  .sortBy('a', 'desc')
  

builder
  .defaultRanking()
  .ranking(ranking);

const lineup = builder.build(document.body);
```

[CodePen](https://codepen.io/sgratzl/pen/vppyML)

[![Advanced Result](https://user-images.githubusercontent.com/4129778/34654174-3235f784-f3f8-11e7-9361-44f5fa068bb9.png)](https://codepen.io/sgratzl/pen/vppyML)


Supported Browsers
------------------

 * Chrome 64+ (best performance)
 * Firefox 57+
 * Edge 16+
 
<a id="demo"></a>

Demo Application
----------------

A demo application is located at [lineup_app](https://github.com/lineupjs/lineup_app). It support CSV Import, CSV Export, JSON Export, CodePen Export, and local data management. 

The application is deployed at [https://lineup.js.org/app](https://lineup.js.org/app)

[![Screenshot](https://user-images.githubusercontent.com/4129778/36336600-8590a932-1389-11e8-8de0-269079efc37b.png)](https://lineup.js.org/app) 


<a id="api"></a>

API Documentation
-----------------

LineUp is implemented in clean TypeScript in an object oriented manner. A fully generated API documentation based on [TypeDoc](http://typedoc.org) is available at https://lineup.js.org/master/docs

LineUp can be build manually or using via the builder design pattern (see [Advanced Usage Example](#advanced_usage_example)). The builder design pattern in the more common way. 

### LineUp Builder

The simplest methods to create a new instance are: 
 * [asLineUp](https://lineup.js.org/master/docs/modules/_builder_index_.html#aslineup) returning a ready to use [LineUp](https://lineup.js.org/master/docs/classes/_ui_lineup_.lineup.html) instance
   ```ts
   asLineUp(node: HTMLElement, data: any[], ...columns: string[]): LineUp
   ```
 * [asTaggle](https://lineup.js.org/master/docs/modules/_builder_index_.html#astaggle) returning a ready to use [Taggle](https://lineup.js.org/master/docs/classes/_ui_taggle_taggle_.taggle.html) instance
   ```ts
   asTaggle(node: HTMLElement, data: any[], ...columns: string[]): Taggle
   ```
 *  [builder](https://lineup.js.org/master/docs/modules/_builder_databuilder_.html#builder) returning a new [DataBuilder](https://lineup.js.org/master/docs/classes/_builder_databuilder_.databuilder.html)
    ```ts
    builder(arr: any[]): DataBuilder`
    ```

The `DataBuilder` allows on the one hand to specify the individual columns more specificly and the creation of custom rankings.

Builder factory functions for creating column descriptions include: 
 * [buildStringColumn](https://lineup.js.org/master/docs/modules/_builder_column_stringcolumnbuilder_.html#buildstringcolumn) returning a new [StringColumnBuilder](https://lineup.js.org/master/docs/classes/_builder_column_stringcolumnbuilder_.stringcolumnbuilder.html)
   ```ts
   buildStringColumn(column: string): StringColumnBuilder
   ```
 * [buildNumberColumn](https://lineup.js.org/master/docs/modules/_builder_column_numbercolumnbuilder_.html#buildnumbercolumn) returning a new [NumberColumnBuilder](https://lineup.js.org/master/docs/classes/_builder_column_numbercolumnbuilder_.numbercolumnbuilder.html)
   ```ts
   buildNumberColumn(column: string, domain?: [number, number]): NumberColumnBuilder
   ```
 * [buildCategoricalColumn](https://lineup.js.org/master/docs/modules/_builder_column_categoricalcolumnbuilder_.html#buildcategoricalcolumn) returning a new [CategoricalColumnBuilder](https://lineup.js.org/master/docs/classes/_builder_column_categoricalcolumnbuilder_.categoricalcolumnbuilder.html)
   ```ts
   buildCategoricalColumn(column: string, categories?: (string | Partial<ICategory>)[]): CategoricalColumnBuilder
   ```
 * [buildHierarchicalColumn](https://lineup.js.org/master/docs/modules/_builder_column_hierarchycolumnbuilder_.html#buildhierarchicalcolumn) returning a new [HierarchyColumnBuilder](https://lineup.js.org/master/docs/classes/_builder_column_hierarchycolumnbuilder_.hierarchycolumnbuilder.html)
   ```ts
   buildHierarchicalColumn(column: string, hierarchy?: IPartialCategoryNode): HierarchyColumnBuilder
   ```
 * [buildDateColumn](https://lineup.js.org/master/docs/modules/_builder_column_datecolumnbuilder_.html#builddatecolumn) returning a new [DateColumnBuilder](https://lineup.js.org/master/docs/classes/_builder_column_datecolumnbuilder_.datecolumnbuilder.html)
   ```ts
   buildDateColumn(column: string): DateColumnBuilder
   ```
 * [buildActionsColumn]( https://lineup.js.org/master/docs/modules/_builder_column_actionscolumnbuilder_.html#buildactionscolumn) returning a new [ActionsColumnBuilder](https://lineup.js.org/master/docs/classes/_builder_column_actionscolumnbuilder_.actionscolumnbuilder.html)
   ```ts
   buildActionsColumn(): ActionsColumnBuilder
   ```

In order to build custom rankings within the `DataBuilder` the [buildRanking]( https://lineup.js.org/master/docs/modules/_builder_rankingbuilder_.html#buildranking) returning a new [RankingBuilder](https://lineup.js.org/master/docs/classes/_builder_rankingbuilder_.rankingbuilder.html) is used. 
```ts
buildRanking(): RankingBuilder
```

### LineUp classes and manual creation

The relevant classes for creating a LineUp instance manually are [LineUp](https://lineup.js.org/master/docs/classes/_ui_lineup_.lineup.html), [Taggle](https://lineup.js.org/master/docs/classes/_ui_taggle_taggle_.taggle.html), and [LocalDataProvider](https://lineup.js.org/master/docs/classes/_provider_localdataprovider_.localdataprovider.html). A `LocalDataProvider` is an sub class of `ADataProvider` implementing the data model management based on a local JavaScript array. `LineUp` and `Taggle` are the visual interfaces to the `LocalDataProvider`. 

The classes can be instantiated either using the factory pattern or via their regular class constructors: 

```ts
createLineUp(container: HTMLElement, data: ADataProvider, config?: Partial<ILineUpOptions>): LineUp

createTaggle(container: HTMLElement, data: ADataProvider, config?: Partial<ITaggleOptions>): Taggle

createLocalDataProvider(data: any[], columns: IColumnDesc[], options?: Partial<ILocalDataProviderOptions>): LocalDataProvider
```
```ts
new LineUp(node: HTMLElement, data: DataProvider, options?: Partial<ILineUpOptions>): LineUp
new Taggle(node: HTMLElement, data: DataProvider, options?: Partial<ITaggleOptions>): Taggle
new LocalDataProvider(data: any[], columns?: IColumnDesc[], options?: Partial<ILocalDataProviderOptions & IDataProviderOptions>): LocalDataProvider
```

Both `LineUp` and `Taggle` are sub classes of [ALineUp](https://lineup.js.org/master/docs/classes/_ui_alineup_.alineup.html). The most important functions of this class include: 

 * [`getHighlight(): number`](https://lineup.js.org/master/docs/classes/_ui_alineup_.alineup.html#gethighlight) / [`setHighlight(dataIndex: number): void`](https://lineup.js.org/master/docs/classes/_ui_alineup_.alineup.html#sethighlight)
   to get and set the highlighted row identified by its index in the data. If none is highlighted `-1` is returned. 
 * [`getSelection(): number[]`](
https://lineup.js.org/master/docs/classes/_ui_lineup_.lineup.html#getselection) / [`setSelection(dataIndices: number[]): void`](https://lineup.js.org/master/docs/classes/_ui_alineup_.alineup.html#setselection)
   to get and set the selected rows identified by their indices in the data
 * [`on(type: string, listener: IEventListener | null): this`](https://lineup.js.org/master/docs/classes/_ui_alineup_.alineup.html#on) to listen to highlight and selection events. LineUp.js event mechanism is based on [d3 dispatch](https://github.com/d3/d3-dispatch), thus instead of and `off` method `null` is passed to disable listening to the event. The following events are sent out: 
   * [`highlightChanged(dataIndex: number): void`](https://lineup.js.org/master/docs/classes/_ui_alineup_.alineup.html#highlightchanged)
   * [`selectionChanged(dataIndices: number[]): void`](https://lineup.js.org/master/docs/classes/_ui_alineup_.alineup.html#selectionchanged)



<a id="react"></a>

React Support (LineUp.jsx)
--------------------------

A [React](https://reactjs.org/) wrapper is located at [lineupjsx](https://github.com/lineupjs/lineupjsx). 


**Installation**

```bash
npm install --save lineupjsx
```

```html
<link href="https://unpkg.com/lineupjsx/build/LineUpJSx.css" rel="stylesheet">
<script src="https://unpkg.com/lineupjsx/build/LineUpJSx.js"></script>
```

**Minimal Usage Example**

```javascript
// generate some data
const arr = [];
const cats = ['c1', 'c2', 'c3'];
for (let i = 0; i < 100; ++i) {
  arr.push({
    a: Math.random() * 10,
    d: 'Row ' + i,
    cat: cats[Math.floor(Math.random() * 3)],
    cat2: cats[Math.floor(Math.random() * 3)]
  })
}
```
```jsx
<LineUp data={arr}/>
```

[CodePen](https://codepen.io/sgratzl/pen/mXEpMP)

Result is same as the builder minimal example

**Advanced Usage Example**

```jsx
// arr from before
<LineUp data={arr} defaultRanking>
  <LineUpStringColumnDesc column="d" label="Label" width={100} />
  <LineUpCategoricalColumnDesc column="cat" categories={cats} color="green" />
  <LineUpCategoricalColumnDesc column="cat2" categories={cats} color="blue" />
  <LineUpNumberColumnDesc column="a" domain={[0, 10]} color="blue" />

  <LineUpRanking groupBy="cat" sortBy="a:desc">
    <LineUpSupportColumn type="*" />
    <LineUpColumn column="*" />
    <LineUpImposeColumn label="a+cat" column="a" categeoricalColumn="cat2" />
  </LineUpRanking>
</LineUp>;
```

[CodePen](https://codepen.io/sgratzl/pen/yvJpWQ)

Result is same as the builder advanced example


<a id="angular"></a>

Angular 6 Support (nglineup)
----------------------------

An [Angular](https://angular.io/) wrapper is located at [nglineup](https://github.com/lineupjs/nglineup). 


**Installation**

```bash
npm install --save nglineup
```

**Minimal Usage Example**

`app.module.ts`:
```ts
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { LineUpModule } from '../lib/lineup.module';

import { AppComponent } from './app.component.1';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    LineUpModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

`app.component.ts`:
```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent {
  readonly data = <any[]>[];

  readonly cats = ['c1', 'c2', 'c3'];

  constructor() {
    const cats = this.cats;
    for (let i = 0; i < 100; ++i) {
      this.data.push({
        a: Math.random() * 10,
        d: 'Row ' + i,
        cat: cats[Math.floor(Math.random() * 3)],
        cat2: cats[Math.floor(Math.random() * 3)]
      });
    }
  }
}
```

`app.component.html`:
```html
<lineup-lineup [data]="data"></lineup-lineup>
```


[CodePen](https://codepen.io/sgratzl/pen/QxYgzN)

Result is same as the builder minimal example


**Advanced Usage Example**

`app.component.html`:
```html
<lineup-lineup [data]="data" [defaultRanking]="true" style="height: 800px;">
  <lineup-string-column-desc column="d" label="Label" [width]="100"></lineup-string-column-desc>
  <lineup-categorical-column-desc column="cat" [categories]="cats" color="green"></lineup-categorical-column-desc>
  <lineup-categorical-column-desc column="cat2" [categories]="cats" color="blue"></lineup-categorical-column-desc>
  <lineup-number-column-desc column="a" [domain]="[0, 10]" color="blue"></lineup-number-column-desc>

  <lineup-ranking groupBy="cat" sortBy="a:desc">
    <lineup-support-column type="*"></lineup-support-column>
    <lineup-column column="*"></lineup-column>
    <lineup-impose-column label="a+cat" column="a" categoricalColumn="cat2"></lineup-impose-column>
  </lineup-ranking>
</lineup-lineup>
```


[CodePen](https://codepen.io/sgratzl/pen/BVMdZL)

Result is same as the builder advanced example


<a id="vue"></a>

Vue.js Support (vue-lineup)
--------------------------

A [Vue.js](https://vuejs.org) wrapper is located at [vue-lineup](https://github.com/lineupjs/vue-lineup). 


**Installation**

```bash
npm install --save vue-lineup
```

**Minimal Usage Example**

```ts
const cats = ['c1', 'c2', 'c3'];
const data = [];
for (let i = 0; i < 100; ++i) {
  data.push({
    a: Math.random() * 10,
    d: 'Row ' + i,
    cat: cats[Math.floor(Math.random() * 3)],
    cat2: cats[Math.floor(Math.random() * 3)],
  });
}

// enable plugin to register components
Vue.use(VueLineUp);

const app = new Vue({
  el: '#app',
  template: `<LineUp v-bind:data="data" />`,
  data: {
    cats,
    data
  }
});
```

[CodePen](https://codepen.io/sgratzl/pen/pKGmvK)

Result is same as the builder minimal example


**Advanced Usage Example**

```ts
const app = new Vue({
  el: '#app',
  template: `<LineUp v-bind:data="data" defaultRanking="true" style="height: 800px">
    <LineUpStringColumnDesc column="d" label="Label" v-bind:width="100" />
    <LineUpCategoricalColumnDesc column="cat" v-bind:categories="cats" color="green" />
    <LineUpCategoricalColumnDesc column="cat2" v-bind:categories="cats" color="blue" />
    <LineUpNumberColumnDesc column="a" v-bind:domain="[0, 10]" color="blue" />
    <LineUpRanking groupBy="cat" sortBy="a:desc">
      <LineUpSupportColumn type="*" />
      <LineUpColumn column="*" />
    </LineUpRanking>
  </LineUp>`,
  data: {
    cats,
    data
  }
});
```

[CodePen](https://codepen.io/sgratzl/pen/vrboWB)

Result is same as the builder advanced example


<a id="polymer"></a>

Polymer Support (LineUp-Element)
--------------------------------

A [Polymer 2.0](https://www.polymer-project.org/) web component wrapper is located at [lineup-element](https://github.com/lineupjs/lineup-element). 


**Installation**

```bash
bower install https://github.com/lineupjs/lineup-element
```

```html
<link rel="import" href="bower_components/lineup-element/lineup-element.html">
```

**Minimal Usage Example**

```javascript
// generate some data
const arr = [];
const cats = ['c1', 'c2', 'c3'];
for (let i = 0; i < 100; ++i) {
  arr.push({
    a: Math.random() * 10,
    d: 'Row ' + i,
    cat: cats[Math.floor(Math.random() * 3)],
    cat2: cats[Math.floor(Math.random() * 3)]
  })
}
conat data = { arr, cats };
```
```jsx
<lineup-element data="[[data.arr]]"></lineup-element>
```

TODO
[CodePen]()

Result is same as the builder minimal example

**Advanced Usage Example**

```jsx
// arr from before
<lineup-element data="[[data.arr]]" side-panel side-panel-collapsed default-ranking="true">
  <lineup-string-desc column="d" label="Label" width="100" ></lineup-string-desc>
  <lineup-categorical-desc column="cat" categories="[[cats]]" color="green" ></lineup-categorical-desc>
  <lineup-categorical-desc column="cat2" categories="[[cats]]" color="blue" ></lineup-categorical-desc>
  <lineup-number-desc column="a" domain="[0, 10]" color="blue" ></lineup-number-desc>
  <lineup-ranking group-by="cat" sort-by="a:desc">
    <lineup-support-column type="*" ></lineup-support-column>
    <lineup-column column="*" ></lineup-column>
  </lineup-ranking>
</lineup-element>
```

TODO
[CodePen]()

Result is same as the builder advanced example


<a id="rshiny"></a>

R, RShiny, and R Markdown Support
---------------------------------

A [HTMLWidget](http://www.htmlwidgets.org/) wrapper for R is located at [lineup_htmlwidget](https://github.com/lineupjs/lineup_htmlwidget). 
It can be used within standalone [R Shiny](https://shiny.rstudio.com/) apps or [R Markdown](http://rmarkdown.rstudio.com/) files. Integrated plotting does not work due to an outdated integrated Webkit version in RStudio.
[Crosstalk](https://rstudio.github.io/crosstalk/) is supported for synching selections and filtering among widgets. 

**Installation**

```R
devtools::install_github("rstudio/crosstalk")
devtools::install_github("lineupjs/lineup_htmlwidget")
library(lineupjs)
```

**Examples**

```R
lineup(iris)
```

![iris output](https://user-images.githubusercontent.com/4129778/34919941-fec50232-f96a-11e7-95be-9eefb213e3d6.png)


<a id="jupyter"></a>

Jupyter Widget (to be released)
--------------

A [Jupyter Widget](https://jupyter.org/widgets.html) wrapper for Python is located at [lineup_widget](https://github.com/lineupjs/lineup_widget).

**Installation**

```bash
pip install -e git+https://github.com/lineupjs/lineup_widget.git#egg=lineup_widget
jupyter nbextension enable --py [--sys-prefix|--user|--system] lineup_widget
```

Or, if you use jupyterlab:

```bash
pip install -e git+https://github.com/lineupjs/lineup_widget.git#egg=lineup_widget
jupyter labextension install @jupyter-widgets/jupyterlab-manager
```

**Examples**

[![Launch Binder][binder-image]][binder-url]

[binder-image]: https://camo.githubusercontent.com/70c5b4d050d4019f4f20b170d75679a9316ac5e5/687474703a2f2f6d7962696e6465722e6f72672f62616467652e737667
[binder-url]: http://mybinder.org/repo/lineupjs/lineup_widget/examples


```python
import lineup_widget
import pandas as pd
import numpy as np

df = pd.DataFrame(np.random.randint(0,100,size=(100, 4)), columns=list('ABCD'))

w = lineup_widget.LineUpWidget(df)
w.on_selection_changed(lambda selection: print(selection))
w
```

![simple usage](https://user-images.githubusercontent.com/4129778/35321859-7925d3a6-00e8-11e8-9884-bcbc76ae51c9.png)

```python
from __future__ import print_function
from ipywidgets import interact, interactive, interact_manual

def selection_changed(selection):
    return df.iloc[selection]

interact(selection_changed, selection=lineup_widget.LineUpWidget(df));
```

![interact example](https://user-images.githubusercontent.com/4129778/35321846-6c5b07cc-00e8-11e8-9388-0acb65cbb509.png)

<a id="observablehq"></a>

Observable HQ
-------------

A [ObservableHQ](https://observablehq.com/) wrapper is located at [lineup-js-observable](https://observablehq.com/@sgratzl/lineup-js-observable-library). 


```js
data = {
  const arr = [];
  const cats = ['c1', 'c2', 'c3'];
  for (let i = 0; i < 100; ++i) {
    arr.push({
      a: Math.random() * 10,
      d: 'Row ' + i,
      cat: cats[Math.floor(Math.random() * 3)],
      cat2: cats[Math.floor(Math.random() * 3)]
    })
  }
  return arr;
}
```
```js
import { asLineUp } from '@sgratzl/lineup-js-observable-library'
```
```js
viewof selection = asLineUp(arr)
```

[ObservableHQ](https://observablehq.com/@sgratzl/lineup-simple-example-with-observable-base)

[![Minimal Result](https://user-images.githubusercontent.com/4129778/75078130-cd276d80-54d2-11ea-9496-0cc685e826ee.png)](https://observablehq.com/@sgratzl/lineup-simple-example-with-observable-base)


### Advanced Usage Example

```js
// arr from before
viewof selection = {
  const b = builder(data);
  b.column(
    LineUpJS.buildStringColumn('d')
      .label('Label')
      .width(100)
  )
    .column(LineUpJS.buildCategoricalColumn('cat', cats).color('green'))
    .column(LineUpJS.buildCategoricalColumn('cat2', cats).color('blue'))
    .column(LineUpJS.buildNumberColumn('a', [0, 10]).color('blue'));

  // and two rankings
  const ranking = LineUpJS.buildRanking()
    .supportTypes()
    .allColumns() // add all columns
    .impose('a+cat', 'a', 'cat2') // create composite column
    .groupBy('cat')
    .sortBy('a', 'desc');

  b.defaultRanking().ranking(ranking);
  return b.build();
}
```

[ObservableHQ](https://observablehq.com/@sgratzl/lineup-advanced-example)

[![Advanced Result](https://user-images.githubusercontent.com/4129778/75078499-bfbeb300-54d3-11ea-92aa-b9ab0d2af043.png)](https://observablehq.com/@sgratzl/lineup-advanced-example)


<a id="powerbi"></a>

PowerBI Custom Visual (under development)
----------------------------------------

A [PowerBI Visual](https://github.com/Microsoft/PowerBI-Visuals) wrapper is located at [lineup_powerbi](https://github.com/lineupjs/lineup_powerbi).

**Installation**

TODO

**Examples**

TODO


API Documentation
-----------------

See [API documentation](https://lineup.js.org/master/docs) and [Develop API documentation](https://lineup.js.org/develop/docs)


Demos
-----

See [Demos](https://lineup.js.org/master), [Develop Demos](https://lineup.js.org/develop), and [R Demos](https://lineup.js.org/R)


Related Publications
---------------------

**LineUp: Visual Analysis of Multi-Attribute Rankings** [Paper](http://data.caleydo.org/papers/2013_infovis_lineup.pdf) [Paper Website](http://caleydo.org/publications/2013_infovis_lineup/)

Samuel Gratzl, Alexander Lex, Nils Gehlenborg, Hanspeter Pfister, and Marc Streit <br>
IEEE Transactions on Visualization and Computer Graphics (InfoVis '13), 19(12), pp. 2277–2286, [doi:10.1109/TVCG.2013.173](https://dx.doi.org/10.1109/TVCG.2013.173), 2013.

:trophy: [IEEE VIS](http://ieeevis.org) InfoVis 2013 Best Paper Award 

**Taggle: Scalable Visualization of Tabular Data through Aggregation** [Paper Preprint](http://data.caleydo.org/papers/2019_sage_infovis_taggle.pdf) [Paper Website](http://caleydo.org/publications/2019_sage_infovis_taggle/)

Katarina Furmanova, Samuel Gratzl, Holger Stitz, Thomas Zichner, Miroslava Jaresova, Martin Ennemoser, Alexander Lex, and Marc Streit <br>
Information Visualization, 19(2): 114-136, [doi:10.1177/1473871619878085](https://dx.doi.org/10.1177/1473871619878085), 2019. 

Dependencies
------------

LineUp.js depends on 
 * [LineUpEngine](https://github.com/lineupjs/lineupengine) table rendering engine
 * [D3](http://d3js.org) utilities: scales, format, dragging
 * [Popper.js](https://popper.js.org) dialogs


**Development Dependencies**

[Webpack](https://webpack.github.io) is used as build tool. LineUp itself is written in [TypeScript](https://www.typescriptlang.org) and [SASS](https://sass-lang.com). 


Development Environment
-----------------------

Try the Gitpod online IDE and start coding instantly in your browser.

[![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/lineupjs/lineupjs)

Otherwise follow the steps to setup a local development environment.

**Installation**

```bash
git clone https://github.com/lineupjs/lineupjs.git -b develop
cd lineupjs
npm install
```

**Build distribution packages**

```bash
npm run build
```

**Run Linting**

```bash
npm run lint
```

**Run Unit Tests**

```bash
npm test
```

**Serve integrated webserver**

```bash
npm start
```

**Run E2E Tests**

via cypress.io

Variant 1: with prebuilt LineUp

```sh
npm run compile
npm run build:prod
npm run cy:open
```

Variant 2: with webpack-dev-server

first shell:
```sh
npm start
```

second shell:
```sh
npm run cy:start
```

**Link develop version**

In order to use the library during development in another repository, one need to build and watch the library and produce development typings. 

```bash
ln -s . <target_project>/node_modules/lineupjs
npm run compile:dev
npm run watch
```

The development typings are needed cause during production the are located at `/src`. That causes problems cause during compilation of a dependent project the Typescript compiler will first find the original TypeScript file e.g. `config.ts` before looking for `config.d.ts`, will complain that the library owner should deliver JavaScript files and won't compile the file. Thus the typings have to lie at a different location in this scenario.

Authors
-------

 * Samuel Gratzl (@sgratzl)
 * Holger Stitz (@thinkh)
 * The Caleydo Team (@caleydo)
 * datavisyn GmbH (@datavisyn)

***

<a href="http://caleydo.org"><img src="https://user-images.githubusercontent.com/4129778/34663868-5455cb76-f459-11e7-95db-f80db24026dc.png" align="left" width="200px" hspace="10" vspace="6"></a>
This repository was created as part of the **[The Caleydo Project](http://caleydo.org/)**.

[npm-image]: https://badge.fury.io/js/lineupjs.svg
[npm-url]: https://npmjs.org/package/lineupjs
[bsd-image]: https://img.shields.io/badge/License-BSD%203--Clause-blue.svg
[bsd-url]: https://opensource.org/licenses/BSD-3-Clause
[ci-image]: https://circleci.com/gh/lineupjs/lineupjs.svg?style=shield
[ci-url]: https://circleci.com/gh/lineupjs/lineupjs
[ci-image-dev]: https://circleci.com/gh/lineupjs/lineupjs/tree/develop.svg?style=shield
[ci-url-dev]: https://circleci.com/gh/lineupjs/lineupjs/tree/develop


 
