# mammal

ESM-native Apache Camel-inspired routing engine for Node.js.

## What is mammal

mammal is an ESM-native Apache Camel-inspired message routing engine for Node.js. It lets you define composable routes, wire components together via URI-addressed endpoints, and drive exchanges through pipelines — with built-in support for error handling and redelivery.

## Installation

mammal is a monorepo. Install all workspace packages from the root:

```sh
npm install
```

Each package (`mammal-core`, `mammal-component-direct`, `mammal-component-log`) is an ESM module. Import from the workspace package name once installed.

## Quickstart

```js
import { MammalContext, Exchange, RouteDefinition } from 'mammal-core';
import { DirectComponent } from 'mammal-component-direct';
import { LogComponent } from 'mammal-component-log';

// 1. Create context and register components
const context = new MammalContext();
context.addComponent('direct', new DirectComponent());
context.addComponent('log', new LogComponent());

// 2. Route A: entry point — set body, dispatch to chain
const routeA = new RouteDefinition('direct:entry');
routeA.process((exchange) => { exchange.in.body = 'hello world'; });
routeA.to('direct:chain');

// 3. Route B: chain — dispatch to log output
const routeB = new RouteDefinition('direct:chain');
routeB.to('log:output?level=log&showBody=true');

context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB]; } });

// 4. Start context — compiles routes with context, registers consumers
await context.start();

// 5. Drive exchange via the context-aware consumer
const exchange = new Exchange();
const consumer = context.getConsumer('direct:entry');
await consumer.process(exchange);

console.log(exchange.in.body); // → 'hello world'

// 6. Stop context
await context.stop();
```

## Driving a route programmatically

Always drive routes via `context.getConsumer(uri).process(exchange)`, **not** `context.getRoute(uri).run()`.

`getRoute(uri)` returns the _eager_ pipeline compiled without a context. This pipeline skips all `to()` nodes — cross-route dispatch is not available. The context-aware pipeline is compiled during `context.start()` and stored in each registered consumer. It is only available after `start()`.

```js
// ✅ Correct — context-aware pipeline, to() dispatch works
const consumer = context.getConsumer('direct:entry');
await consumer.process(exchange);

// ❌ Wrong — eager no-context pipeline, to() nodes are silently skipped
// context.getRoute('direct:entry').run(exchange);
```

## Error handling

Use `onException` on a `RouteDefinition` to register an error handler for a specific error class. By default, `handled: true` clears `exchange.exception` after the handler runs — use `exchange.isFailed()` to check whether the exchange is in a failed state.

```js
import { MammalContext, Exchange, RouteDefinition } from 'mammal-core';
import { DirectComponent } from 'mammal-component-direct';

const context = new MammalContext();
context.addComponent('direct', new DirectComponent());

const route = new RouteDefinition('direct:risky');

// Register error handler before calling process()
route.onException(TypeError, (exchange) => {
  console.error('Caught TypeError:', exchange.exception?.message);
  exchange.in.body = 'fallback';
});

route.process((exchange) => {
  throw new TypeError('something went wrong');
});

context.addRoutes({ configure() {}, getRoutes() { return [route]; } });
await context.start();

const exchange = new Exchange();
await context.getConsumer('direct:risky').process(exchange);

console.log(exchange.in.body);      // → 'fallback'
console.log(exchange.exception);    // → null  (cleared because handled: true)
console.log(exchange.isFailed());   // → false

await context.stop();
```

### Redelivery options

Pass options to `onException` to control retry behaviour:

```js
route.onException(TypeError, handler, {
  handled: true,       // default: true — clears exchange.exception after handler
  maxAttempts: 3,      // retry the failing step up to 3 additional times
  redeliveryDelay: 50, // milliseconds between retries
});
```

> **Note:** `maxAttempts` and `redeliveryDelay` are configured on the `Pipeline` level via `RouteDefinition.compile()` options. Per-step retry support is available in `Pipeline` directly; the `onException` route-level API exposes `handled` only — use `Pipeline` directly for fine-grained retry control.
