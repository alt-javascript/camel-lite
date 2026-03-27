[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

Async in-process queuing via a blocking queue. `seda:` (Staged Event-Driven Architecture) decouples producer and consumer threads — the producer returns immediately after enqueuing, and the consumer processes independently.

## Install

```sh
npm install camel-lite-component-seda
```

## URI Syntax

```
seda:name[?size=0&concurrentConsumers=1]
```

| Parameter            | Default | Description |
|----------------------|---------|-------------|
| `size`               | `0`     | Maximum queue depth. `0` = unlimited. |
| `concurrentConsumers`| `1`     | Number of concurrent consumer workers draining the queue. |

## Usage

```js
import { CamelContext } from 'camel-lite-core';
import { SedaComponent } from 'camel-lite-component-seda';

const context = new CamelContext();
context.addComponent('seda', new SedaComponent());

context.addRoutes({
  configure(ctx) {
    // Consumer route — runs async
    ctx.from('seda:work')
      .process(exchange => {
        console.log('Processing:', exchange.in.body);
      });

    // Producer route — fire-and-forget
    ctx.from('direct:submit')
      .to('seda:work');
  }
});

await context.start();

// Fire-and-forget: returns before seda:work processes the exchange
const template = context.createProducerTemplate();
await template.sendBody('seda:work', 'task payload');

// Receive a single body (blocks until one is available)
const consumer = context.createConsumerTemplate();
const body = await consumer.receiveBody('seda:work');
console.log(body);

await context.stop();
```

## See Also

[camel-lite — root README](../../README.md)
