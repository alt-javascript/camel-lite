[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

Structured logging via [`@alt-javascript/logger`](https://www.npmjs.com/package/@alt-javascript/logger). Sends the exchange body (stringified if not already a string) to the named logger at the configured level. Producer-only — no consumer.

## Install

```sh
npm install camel-lite-component-log @alt-javascript/logger @alt-javascript/config @alt-javascript/common
```

## URI Syntax

```
log:loggerName[?level=info]
```

| Segment / Parameter | Default | Description |
|---------------------|---------|-------------|
| `loggerName`        | *(required)* | Logger category name (case-preserved). Passed directly to `LoggerFactory.getLogger`. |
| `level`             | `info`  | Log level: `trace`, `debug`, `info`, `warn`, or `error`. |

## Usage

```js
import { CamelContext } from 'camel-lite-core';
import { LogComponent } from 'camel-lite-component-log';

const context = new CamelContext();
context.addComponent('log', new LogComponent());

context.addRoutes({
  configure(ctx) {
    ctx.from('direct:ingest')
      .to('log:com.example.ingest?level=debug')
      .process(exchange => {
        // continue processing after log
      });
  }
});

await context.start();

const template = context.createProducerTemplate();
await template.sendBody('direct:ingest', { id: 1, value: 'hello' });

await context.stop();
```

## See Also

[camel-lite — root README](../../README.md)
