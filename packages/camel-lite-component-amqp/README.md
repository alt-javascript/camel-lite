[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

AMQP messaging supporting both AMQP 1.0 ([rhea](https://www.npmjs.com/package/rhea)) and AMQP 0-9-1 ([amqplib](https://www.npmjs.com/package/amqplib)). Producers send exchange body to a queue or topic; consumers receive messages and set them as the exchange body.

## Install

```sh
npm install camel-lite-component-amqp
```

## URI Syntax

```
amqp:queue:name[?protocol=amqp10&url=amqp://localhost]
amqp:topic:name[?protocol=amqp10&url=amqp://localhost]
```

| Parameter  | Default         | Description |
|------------|-----------------|-------------|
| `protocol` | `amqp10`        | Wire protocol: `amqp10` (AMQP 1.0 via rhea) or `amqp091` (AMQP 0-9-1 via amqplib). |
| `url`      | `amqp://localhost` | Broker connection URL. |

## Usage

**Producer — send to a queue:**

```js
import { CamelContext } from 'camel-lite-core';
import { AmqpComponent } from 'camel-lite-component-amqp';

const context = new CamelContext();
context.addComponent('amqp', new AmqpComponent());

context.addRoutes({
  configure(ctx) {
    ctx.from('direct:send')
      .to('amqp:queue:orders?protocol=amqp10&url=amqp://localhost:5672');
  }
});

await context.start();

const template = context.createProducerTemplate();
await template.sendBody('direct:send', JSON.stringify({ orderId: 42 }));

await context.stop();
```

**Consumer — receive from a queue:**

```js
context.addRoutes({
  configure(ctx) {
    ctx.from('amqp:queue:orders?protocol=amqp10&url=amqp://localhost:5672')
      .process(exchange => {
        console.log('Received:', exchange.in.body);
      });
  }
});
```

## See Also

[camel-lite — root README](../../README.md)
