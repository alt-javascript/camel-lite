import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CamelContext, Exchange, RouteDefinition } from '@alt-javascript/camel-lite-core';
import { DirectComponent } from '@alt-javascript/camel-lite-component-direct';
import { LogComponent } from '@alt-javascript/camel-lite-component-log';

describe('End-to-end integration: direct: + log: components', () => {
  it('routes an exchange through two chained direct: routes ending at log:', async () => {
    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('log', new LogComponent());

    const routeA = new RouteDefinition('direct:entry');
    routeA.process((exchange) => { exchange.in.body = 'hello'; });
    routeA.to('direct:chain');

    const routeB = new RouteDefinition('direct:chain');
    routeB.process((exchange) => { exchange.in.body = exchange.in.body + ' world'; });
    routeB.to('log:output?level=info&showBody=true');

    context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB]; } });

    await context.start();
    try {
      const exchange = new Exchange();
      const entryConsumer = context.getConsumer('direct:entry');
      assert.ok(entryConsumer, 'DirectConsumer for direct:entry must be registered after start()');

      await entryConsumer.process(exchange);

      assert.equal(exchange.in.body, 'hello world',
        `Expected 'hello world', got: ${JSON.stringify(exchange.in.body)}`);
      assert.equal(exchange.exception, null, 'exchange.exception should be null');
    } finally {
      await context.stop();
    }
  });

  it('context.stop() deregisters all consumers', async () => {
    const context = new CamelContext();
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

  it('standalone log producer route works end-to-end — exchange state correct', async () => {
    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('log', new LogComponent());

    const route = new RouteDefinition('direct:standalone');
    route.process((exchange) => { exchange.in.body = 'standalone message'; });
    route.to('log:standalone?level=info&showBody=true');

    context.addRoutes({ configure() {}, getRoutes() { return [route]; } });

    await context.start();
    try {
      const exchange = new Exchange();
      await context.getConsumer('direct:standalone').process(exchange);

      assert.equal(exchange.in.body, 'standalone message');
      assert.equal(exchange.exception, null);
    } finally {
      await context.stop();
    }
  });
});
