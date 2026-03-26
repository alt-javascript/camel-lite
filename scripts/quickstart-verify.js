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

console.log('exchange.in.body:', exchange.in.body); // → 'hello world'

if (exchange.in.body !== 'hello world') {
  console.error('FAIL: expected exchange.in.body to be "hello world", got:', exchange.in.body);
  process.exit(1);
}

// 6. Stop context
await context.stop();

console.log('quickstart-verify: OK');
