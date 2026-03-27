import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CamelContext, Exchange, Pipeline, RouteDefinition } from 'camel-lite-core';
import { DirectComponent } from 'camel-lite-component-direct';
import { SedaComponent, SedaEndpoint, SedaProducer, SedaConsumer, SedaQueue } from 'camel-lite-component-seda';

// Promise latch — resolves once `count` items have been processed
function makeLatch(count) {
  let resolve;
  let remaining = count;
  const promise = new Promise(r => { resolve = r; });
  const tick = () => { if (--remaining <= 0) resolve(); };
  return { promise, tick };
}

describe('SedaComponent', () => {
  it('can be constructed', () => {
    const c = new SedaComponent();
    assert.ok(c instanceof SedaComponent);
  });

  it('createEndpoint returns SedaEndpoint', () => {
    const c = new SedaComponent();
    const ctx = new CamelContext();
    const ep = c.createEndpoint('seda:work', 'work', new URLSearchParams(), ctx);
    assert.ok(ep instanceof SedaEndpoint);
    assert.equal(ep.uri, 'seda:work');
  });

  it('createEndpoint returns same endpoint for same URI (endpoint cache)', () => {
    const c = new SedaComponent();
    const ctx = new CamelContext();
    const ep1 = c.createEndpoint('seda:work', 'work', new URLSearchParams(), ctx);
    const ep2 = c.createEndpoint('seda:work', 'work', new URLSearchParams(), ctx);
    assert.strictEqual(ep1, ep2, 'same URI must return same endpoint (shared queue)');
  });
});

describe('SedaEndpoint', () => {
  it('createProducer returns SedaProducer', () => {
    const ctx = new CamelContext();
    const ep = new SedaEndpoint('seda:work', 'work', new URLSearchParams(), ctx);
    const producer = ep.createProducer();
    assert.ok(producer instanceof SedaProducer);
    assert.equal(producer.uri, 'seda:work');
  });

  it('createConsumer returns SedaConsumer', () => {
    const ctx = new CamelContext();
    const ep = new SedaEndpoint('seda:work', 'work', new URLSearchParams(), ctx);
    const pipeline = new Pipeline([]);
    const consumer = ep.createConsumer(pipeline);
    assert.ok(consumer instanceof SedaConsumer);
    assert.equal(consumer.uri, 'seda:work');
  });

  it('concurrentConsumers defaults to 1', () => {
    const ctx = new CamelContext();
    const ep = new SedaEndpoint('seda:work', 'work', new URLSearchParams(), ctx);
    assert.equal(ep.concurrentConsumers, 1);
  });

  it('concurrentConsumers parsed from URI param', () => {
    const ctx = new CamelContext();
    const ep = new SedaEndpoint('seda:work', 'work', new URLSearchParams('concurrentConsumers=4'), ctx);
    assert.equal(ep.concurrentConsumers, 4);
  });

  it('size defaults to 0 (unlimited)', () => {
    const ctx = new CamelContext();
    const ep = new SedaEndpoint('seda:work', 'work', new URLSearchParams(), ctx);
    assert.equal(ep.size, 0);
  });
});

describe('SedaProducer', () => {
  it('send() enqueues without awaiting downstream processing', async () => {
    const queue = new SedaQueue();
    const producer = new SedaProducer('seda:work', queue);
    const exchange = new Exchange();

    // Consumer loop waits for item
    const dequeuePromise = queue.dequeue();
    await producer.send(exchange);

    // send() returned — now await the dequeue
    const dequeued = await dequeuePromise;
    assert.strictEqual(dequeued, exchange);
  });
});

describe('SedaConsumer lifecycle', () => {
  it('start() registers consumer with context', async () => {
    const ctx = new CamelContext();
    const queue = new SedaQueue();
    const pipeline = new Pipeline([]);
    const consumer = new SedaConsumer('seda:test', ctx, pipeline, queue, 1);

    await consumer.start();
    assert.strictEqual(ctx.getConsumer('seda:test'), consumer);
    await consumer.stop();
  });

  it('stop() deregisters consumer from context', async () => {
    const ctx = new CamelContext();
    const queue = new SedaQueue();
    const pipeline = new Pipeline([]);
    const consumer = new SedaConsumer('seda:test', ctx, pipeline, queue, 1);

    await consumer.start();
    await consumer.stop();
    assert.equal(ctx.getConsumer('seda:test'), null);
  });
});

describe('SEDA integration: single consumer, 10 exchanges', () => {
  it('all 10 exchanges processed and drained by stop()', async () => {
    const { promise: latch, tick } = makeLatch(10);
    const processed = [];

    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('seda', new SedaComponent());

    // Entry route: direct:entry → seda:work (fire-and-forget)
    const routeA = new RouteDefinition('direct:entry');
    routeA.process((exchange) => { exchange.in.body = `msg-${exchange.in.body}`; });
    routeA.to('seda:work');

    // Worker route: seda:work → process
    const routeB = new RouteDefinition('seda:work');
    routeB.process((exchange) => {
      processed.push(exchange.in.body);
      tick();
    });

    context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB]; } });
    await context.start();

    const entryConsumer = context.getConsumer('direct:entry');

    // Enqueue 10 exchanges via direct:entry → seda:work
    for (let i = 0; i < 10; i++) {
      const exchange = new Exchange();
      exchange.in.body = i;
      await entryConsumer.process(exchange);
    }

    // Wait for all 10 to be processed by the seda worker
    await latch;
    // Drain workers
    await context.stop();

    assert.equal(processed.length, 10, `expected 10 processed, got ${processed.length}`);
    assert.ok(!context.getConsumer('seda:work'), 'consumer deregistered after stop');
  });

  it('pipeline error in worker does not stop the worker — subsequent exchanges still processed', async () => {
    const { promise: latch, tick } = makeLatch(5);
    const processed = [];

    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('seda', new SedaComponent());

    const routeA = new RouteDefinition('direct:entry');
    routeA.to('seda:work');

    let callCount = 0;
    const routeB = new RouteDefinition('seda:work');
    routeB.process((exchange) => {
      callCount++;
      if (callCount === 2) throw new Error('deliberate worker error');
      processed.push(exchange.in.body);
      tick();
    });

    context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB]; } });
    await context.start();

    const entryConsumer = context.getConsumer('direct:entry');
    for (let i = 0; i < 6; i++) {
      const exchange = new Exchange();
      exchange.in.body = `item-${i}`;
      await entryConsumer.process(exchange);
    }

    await latch;
    await context.stop();

    // 1 of 6 failed mid-pipeline (exception captured in exchange); 5 completed
    assert.equal(processed.length, 5);
  });
});
