[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

Synchronous in-process routing between routes. `direct:` delivers exchanges immediately in the calling thread — zero queue, zero latency. Cycle detection is built in; circular routes throw a `CamelError` at dispatch time.

## Install

```sh
npm install camel-lite-component-direct
```

## URI Syntax

```
direct:name
```

| Segment | Description |
|---------|-------------|
| `name`  | Route name (case-sensitive). Must match the `from('direct:name')` of the target route. |

No query parameters.

## Usage

```js
import { CamelContext } from 'camel-lite-core';
import { DirectComponent } from 'camel-lite-component-direct';

const context = new CamelContext();
context.addComponent('direct', new DirectComponent());

context.addRoutes({
  configure(ctx) {
    ctx.from('direct:greet')
      .process(exchange => {
        exchange.in.body = `Hello, ${exchange.in.body}!`;
      });

    ctx.from('direct:start')
      .to('direct:greet');
  }
});

await context.start();

const template = context.createProducerTemplate();
const exchange = await template.send('direct:start', ex => { ex.in.body = 'World'; });
console.log(exchange.in.body); // Hello, World!

await context.stop();
```

## See Also

[camel-lite — root README](../../README.md)
