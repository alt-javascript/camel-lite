import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Exchange, CamelContext, Pipeline, CycleDetectedError } from '@alt-javascript/camel-lite-core';
import { DirectComponent, DirectEndpoint, DirectProducer, DirectConsumer } from '@alt-javascript/camel-lite-component-direct';

// Helper: build a minimal pipeline that sets a property on the exchange
function mutatingPipeline(key, value) {
  return new Pipeline([
    async (exchange) => {
      exchange.setProperty(key, value);
    },
  ]);
}

describe('DirectComponent', () => {
  it('can be constructed', () => {
    const dc = new DirectComponent();
    assert.ok(dc instanceof DirectComponent);
  });

  it('createEndpoint returns DirectEndpoint', () => {
    const dc = new DirectComponent();
    const ctx = new CamelContext();
    const ep = dc.createEndpoint('direct:foo', 'foo', {}, ctx);
    assert.ok(ep instanceof DirectEndpoint);
    assert.equal(ep.uri, 'direct:foo');
  });
});

describe('DirectEndpoint', () => {
  it('createProducer returns DirectProducer', () => {
    const ctx = new CamelContext();
    const ep = new DirectEndpoint('direct:foo', ctx);
    const producer = ep.createProducer();
    assert.ok(producer instanceof DirectProducer);
    assert.equal(producer.uri, 'direct:foo');
  });

  it('createConsumer returns DirectConsumer', () => {
    const ctx = new CamelContext();
    const ep = new DirectEndpoint('direct:foo', ctx);
    const pipeline = mutatingPipeline('hit', true);
    const consumer = ep.createConsumer(pipeline);
    assert.ok(consumer instanceof DirectConsumer);
    assert.equal(consumer.uri, 'direct:foo');
  });
});

describe('DirectConsumer', () => {
  it('start() registers with context; getConsumer returns it', async () => {
    const ctx = new CamelContext();
    const pipeline = mutatingPipeline('hit', true);
    const consumer = new DirectConsumer('direct:bar', ctx, pipeline);

    await consumer.start();
    assert.strictEqual(ctx.getConsumer('direct:bar'), consumer);
  });

  it('stop() deregisters from context', async () => {
    const ctx = new CamelContext();
    const pipeline = mutatingPipeline('hit', true);
    const consumer = new DirectConsumer('direct:bar', ctx, pipeline);

    await consumer.start();
    await consumer.stop();
    assert.equal(ctx.getConsumer('direct:bar'), null);
  });

  it('process() runs the pipeline on the exchange', async () => {
    const ctx = new CamelContext();
    const pipeline = mutatingPipeline('processed', 42);
    const consumer = new DirectConsumer('direct:baz', ctx, pipeline);

    const exchange = new Exchange();
    await consumer.process(exchange);
    assert.equal(exchange.getProperty('processed'), 42);
  });
});

describe('DirectProducer', () => {
  it('send() dispatches through consumer and exchange is mutated', async () => {
    const ctx = new CamelContext();
    const pipeline = mutatingPipeline('answer', 99);
    const consumer = new DirectConsumer('direct:qux', ctx, pipeline);
    await consumer.start();

    const producer = new DirectProducer('direct:qux', ctx);
    const exchange = new Exchange();
    await producer.send(exchange);

    assert.equal(exchange.getProperty('answer'), 99);
  });

  it('send() throws an error when no consumer is registered', async () => {
    const ctx = new CamelContext();
    const producer = new DirectProducer('direct:missing', ctx);
    const exchange = new Exchange();

    await assert.rejects(
      () => producer.send(exchange),
      { message: 'No consumer registered for: direct:missing' }
    );
  });

  it('send() throws CycleDetectedError when cycle detected', async () => {
    const ctx = new CamelContext();

    // A consumer whose pipeline calls back into the same URI — simulates a cycle
    const cyclingPipeline = new Pipeline([
      async (exchange) => {
        // Directly invoke the producer again to create the cycle
        const innerProducer = new DirectProducer('direct:cycle', ctx);
        await innerProducer.send(exchange);
      },
    ]);

    const consumer = new DirectConsumer('direct:cycle', ctx, cyclingPipeline);
    await consumer.start();

    const producer = new DirectProducer('direct:cycle', ctx);
    const exchange = new Exchange();

    // Pipeline catches errors into exchange.exception
    await producer.send(exchange);
    assert.ok(exchange.isFailed(), 'exchange should be failed');
    assert.ok(exchange.exception instanceof CycleDetectedError,
      `expected CycleDetectedError, got ${exchange.exception?.constructor?.name}`);
  });

  it('direct call stack is restored after send() completes', async () => {
    const ctx = new CamelContext();
    const pipeline = mutatingPipeline('done', true);
    const consumer = new DirectConsumer('direct:restore', ctx, pipeline);
    await consumer.start();

    const producer = new DirectProducer('direct:restore', ctx);
    const exchange = new Exchange();
    await producer.send(exchange);

    // After send completes, stack should be back to empty/original
    const stack = exchange.getProperty('camel.directStack');
    assert.deepEqual(stack, []);
  });
});
