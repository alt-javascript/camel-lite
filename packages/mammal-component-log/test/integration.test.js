import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MammalContext, Exchange, RouteDefinition } from 'mammal-core';
import { DirectComponent } from 'mammal-component-direct';
import { LogComponent } from 'mammal-component-log';

describe('End-to-end integration: direct: + log: components', () => {
  it('routes an exchange through two chained direct: routes ending at log:', async () => {
    // 1. Create context and register components
    const context = new MammalContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('log', new LogComponent());

    // 2. Route A: direct:entry → set body → dispatch to direct:chain
    const routeA = new RouteDefinition('direct:entry');
    routeA.process((exchange) => { exchange.in.body = 'hello'; });
    routeA.to('direct:chain');

    // 3. Route B: direct:chain → append to body → dispatch to log:output
    const routeB = new RouteDefinition('direct:chain');
    routeB.process((exchange) => { exchange.in.body = exchange.in.body + ' world'; });
    routeB.to('log:output?level=log&showBody=true');

    context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB]; } });

    // 4. Spy on console.log before start
    const logCalls = [];
    const origLog = console.log;
    console.log = (...args) => logCalls.push(args);

    try {
      // 5. Start — compiles with context, registers DirectConsumers
      await context.start();

      // 6. Drive exchange via context-aware DirectConsumer for entry
      const exchange = new Exchange();
      const entryConsumer = context.getConsumer('direct:entry');
      assert.ok(entryConsumer, 'DirectConsumer for direct:entry must be registered after start()');

      await entryConsumer.process(exchange);

      // 7. Body must be 'hello world' after full pipeline traversal
      assert.equal(exchange.in.body, 'hello world',
        `Expected 'hello world', got: ${JSON.stringify(exchange.in.body)}`);

      // 8. console.log called with message containing 'hello world'
      assert.ok(logCalls.length >= 1, 'console.log should have been called at least once');
      const loggedMessage = logCalls[0][0];
      assert.ok(
        typeof loggedMessage === 'string' && loggedMessage.includes('hello world'),
        `Expected log message to contain 'hello world', got: ${JSON.stringify(loggedMessage)}`
      );

      // 9. No exception on the exchange
      assert.equal(exchange.exception, null, 'exchange.exception should be null');

    } finally {
      console.log = origLog;
      await context.stop();
    }
  });

  it('context.stop() deregisters all consumers', async () => {
    const context = new MammalContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('log', new LogComponent());

    const routeA = new RouteDefinition('direct:entry2');
    routeA.process((exchange) => { exchange.in.body = 'test'; });
    routeA.to('log:sink?showBody=false');

    context.addRoutes({ configure() {}, getRoutes() { return [routeA]; } });

    await context.start();
    assert.ok(context.getConsumer('direct:entry2'), 'consumer registered after start');

    await context.stop();
    const consumer = context.getConsumer('direct:entry2');
    assert.ok(!consumer, 'consumer should be deregistered after stop');
  });

  it('standalone log producer route works end-to-end', async () => {
    const context = new MammalContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('log', new LogComponent());

    const route = new RouteDefinition('direct:standalone');
    route.process((exchange) => { exchange.in.body = 'standalone message'; });
    route.to('log:standalone?level=log&showBody=true');

    context.addRoutes({ configure() {}, getRoutes() { return [route]; } });

    const logCalls = [];
    const origLog = console.log;
    console.log = (...args) => logCalls.push(args);

    try {
      await context.start();

      const exchange = new Exchange();
      await context.getConsumer('direct:standalone').process(exchange);

      assert.equal(exchange.in.body, 'standalone message');
      assert.equal(exchange.exception, null);
      assert.ok(logCalls.length >= 1);
      assert.ok(logCalls[0][0].includes('standalone message'));
    } finally {
      console.log = origLog;
      await context.stop();
    }
  });
});
