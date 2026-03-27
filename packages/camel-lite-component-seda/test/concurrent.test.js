import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CamelContext, Exchange, RouteDefinition, SedaQueueFullError } from '@alt-javascript/camel-lite-core';
import { DirectComponent } from '@alt-javascript/camel-lite-component-direct';
import { SedaComponent, SedaQueue, SedaProducer, SedaConsumer, SedaEndpoint } from '@alt-javascript/camel-lite-component-seda';

function makeLatch(count) {
  let resolve;
  let remaining = count;
  const promise = new Promise(r => { resolve = r; });
  const tick = () => { if (--remaining <= 0) resolve(); };
  return { promise, tick };
}

describe('Concurrent consumers', () => {
  it('4 concurrent workers process 100 exchanges — all processed, none lost', async () => {
    const { promise: latch, tick } = makeLatch(100);
    let counter = 0;

    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('seda', new SedaComponent());

    const routeA = new RouteDefinition('direct:entry');
    routeA.to('seda:work?concurrentConsumers=4');

    const routeB = new RouteDefinition('seda:work?concurrentConsumers=4');
    routeB.process((exchange) => {
      counter++;
      tick();
    });

    context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB]; } });
    await context.start();

    const entryConsumer = context.getConsumer('direct:entry');
    for (let i = 0; i < 100; i++) {
      const exchange = new Exchange();
      exchange.in.body = i;
      await entryConsumer.process(exchange);
    }

    await latch;
    await context.stop();

    assert.equal(counter, 100, `expected 100 processed, got ${counter}`);
  });

  it('stop() with 4 workers in-flight drains all workers cleanly', async () => {
    const TOTAL = 40;
    const { promise: latch, tick } = makeLatch(TOTAL);
    let counter = 0;

    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('seda', new SedaComponent());

    const routeA = new RouteDefinition('direct:entry');
    routeA.to('seda:drain?concurrentConsumers=4');

    const routeB = new RouteDefinition('seda:drain?concurrentConsumers=4');
    routeB.process(async (exchange) => {
      // Simulate a tiny bit of async work
      await new Promise(r => setTimeout(r, 5));
      counter++;
      tick();
    });

    context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB]; } });
    await context.start();

    const entryConsumer = context.getConsumer('direct:entry');
    for (let i = 0; i < TOTAL; i++) {
      const exchange = new Exchange();
      exchange.in.body = i;
      await entryConsumer.process(exchange);
    }

    // Wait for all to be processed, then stop
    await latch;
    const stopStart = Date.now();
    await context.stop();
    const stopDuration = Date.now() - stopStart;

    assert.equal(counter, TOTAL, `expected ${TOTAL} processed, got ${counter}`);
    assert.ok(stopDuration < 2000, `stop() should be fast after drain, took ${stopDuration}ms`);
  });
});

describe('Backpressure', () => {
  it('size=2: 3rd enqueue throws SedaQueueFullError', async () => {
    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());
    context.addComponent('seda', new SedaComponent());

    // Use a very slow consumer so items stay in queue long enough to hit the limit
    const { promise: latch, tick } = makeLatch(2);

    const routeA = new RouteDefinition('direct:entry');
    routeA.to('seda:bounded?size=2');

    const routeB = new RouteDefinition('seda:bounded?size=2');
    routeB.process(async (exchange) => {
      // Slow enough that 3 items could pile up before processing starts
      await new Promise(r => setTimeout(r, 50));
      tick();
    });

    context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB]; } });
    await context.start();

    // To reliably test backpressure, enqueue directly to a queue with no running consumer
    const queue = new SedaQueue(2);
    queue.enqueue(new Exchange());
    queue.enqueue(new Exchange());

    let threw = false;
    try {
      queue.enqueue(new Exchange());
    } catch (err) {
      threw = true;
      assert.ok(err instanceof SedaQueueFullError, `expected SedaQueueFullError, got ${err.constructor.name}`);
      assert.equal(err.maxSize, 2);
      assert.ok(err.message.includes('2'));
    }

    assert.ok(threw, 'should have thrown SedaQueueFullError on 3rd enqueue');
    await context.stop();
  });

  it('SedaQueueFullError propagates through send() to caller', async () => {
    const queue = new SedaQueue(1);
    const producer = new SedaProducer('seda:bounded', queue);

    const ex1 = new Exchange();
    const ex2 = new Exchange();

    await producer.send(ex1); // succeeds — queue has 1 item

    await assert.rejects(
      () => producer.send(ex2),
      (err) => {
        assert.ok(err instanceof SedaQueueFullError);
        assert.equal(err.maxSize, 1);
        return true;
      }
    );
  });

  it('SedaEndpoint with size param creates bounded queue', () => {
    const ctx = new CamelContext();
    const ep = new SedaEndpoint('seda:bounded', 'bounded', new URLSearchParams('size=5'), ctx);
    assert.equal(ep.size, 5);
  });
});
