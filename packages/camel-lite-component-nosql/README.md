[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

NoSQL collection operations via [`@alt-javascript/jsnosqlc`](https://www.npmjs.com/package/@alt-javascript/jsnosqlc). Supports insert, find, update, delete, and count against named collections.

## Install

```sh
npm install camel-lite-component-nosql @alt-javascript/jsnosqlc
```

## URI Syntax

```
nosql:collectionName[?url=jsnosqlc:memory:&operation=insert]
```

| Parameter    | Default          | Description |
|--------------|------------------|-------------|
| `url`        | *(required)*     | jsnosqlc connection URL (e.g. `jsnosqlc:memory:` or a file path). |
| `operation`  | `insert`         | Collection operation: `insert`, `find`, `update`, `delete`, or `count`. |

## Usage

```js
import { CamelContext } from 'camel-lite-core';
import { NosqlComponent } from 'camel-lite-component-nosql';

const context = new CamelContext();
context.addComponent('nosql', new NosqlComponent());

context.addRoutes({
  configure(ctx) {
    // Insert exchange body as a document
    ctx.from('direct:storeEvent')
      .to('nosql:events?url=jsnosqlc:memory:&operation=insert');

    // Find documents — exchange body used as the query filter
    ctx.from('direct:queryEvents')
      .to('nosql:events?url=jsnosqlc:memory:&operation=find');
  }
});

await context.start();

const template = context.createProducerTemplate();

// Insert
await template.sendBody('direct:storeEvent', { type: 'login', userId: 7 });

// Find — pass a filter object as body
const exchange = await template.send('direct:queryEvents', ex => {
  ex.in.body = { type: 'login' };
});
console.log('Found:', exchange.in.body);

await context.stop();
```

## See Also

[camel-lite — root README](../../README.md)
