import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/ProcessorNormalizer.js';
import { Pipeline } from '../src/Pipeline.js';
import CamelError from '../src/errors/CamelError.js';
import { Exchange } from '../src/Exchange.js';

describe('ProcessorNormalizer', () => {
  it('accepts an async function and returns it unchanged', async () => {
    const fn = async (exchange) => { exchange.in.body = 'hello'; };
    const normalised = normalize(fn);
    assert.strictEqual(normalised, fn);
    const ex = new Exchange();
    await normalised(ex);
    assert.equal(ex.in.body, 'hello');
  });

  it('accepts a plain (non-async) function and returns it', () => {
    const fn = (exchange) => { exchange.in.body = 'sync'; };
    const normalised = normalize(fn);
    assert.strictEqual(normalised, fn);
  });

  it('accepts a processor object with process() method and wraps it', async () => {
    const obj = {
      process(exchange) {
        exchange.in.body = 'from-object';
      },
    };
    const normalised = normalize(obj);
    assert.equal(typeof normalised, 'function');
    const ex = new Exchange();
    await normalised(ex);
    assert.equal(ex.in.body, 'from-object');
  });

  it('throws CamelError on null input', () => {
    assert.throws(() => normalize(null), (err) => {
      assert.ok(err instanceof CamelError);
      assert.equal(err.name, 'CamelError');
      return true;
    });
  });

  it('throws CamelError on a plain object without process()', () => {
    assert.throws(() => normalize({ foo: 'bar' }), (err) => {
      assert.ok(err instanceof CamelError);
      return true;
    });
  });

  it('throws CamelError on a number', () => {
    assert.throws(() => normalize(42), (err) => {
      assert.ok(err instanceof CamelError);
      return true;
    });
  });
});

describe('Pipeline', () => {
  it('single step: processor mutates exchange.in.body directly', async () => {
    const step = normalize(async (ex) => { ex.in.body = 'step1'; });
    const pipeline = new Pipeline([step]);
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(ex.in.body, 'step1');
  });

  it('multi-step out→in promotion: step 2 receives promoted body', async () => {
    let step2InBody;
    let step2OutBody;

    const step1 = normalize(async (ex) => { ex.out.body = 'A'; });
    const step2 = normalize(async (ex) => {
      step2InBody = ex.in.body;
      step2OutBody = ex.out.body;
    });

    const pipeline = new Pipeline([step1, step2]);
    const ex = new Exchange();
    await pipeline.run(ex);

    assert.equal(step2InBody, 'A', 'step2 should see promoted in.body');
    assert.equal(step2OutBody, null, 'step2 should see reset out.body');
  });

  it('out NOT set: step 2 receives unchanged exchange.in', async () => {
    const ex = new Exchange();
    ex.in.body = 'original';

    let step2InBody;
    const step1 = normalize(async () => { /* does not touch out */ });
    const step2 = normalize(async (e) => { step2InBody = e.in.body; });

    const pipeline = new Pipeline([step1, step2]);
    await pipeline.run(ex);
    assert.equal(step2InBody, 'original');
  });

  it('exception capture: throws → isFailed() true, later steps not called', async () => {
    let step2Called = false;
    const step1 = normalize(async () => { throw new Error('boom'); });
    const step2 = normalize(async () => { step2Called = true; });

    const pipeline = new Pipeline([step1, step2]);
    const ex = new Exchange();
    await pipeline.run(ex);

    assert.equal(ex.isFailed(), true);
    assert.ok(ex.exception instanceof Error);
    assert.equal(ex.exception.message, 'boom');
    assert.equal(step2Called, false);
  });

  it('exception capture: exchange.exception is the exact thrown error', async () => {
    const err = new TypeError('type mismatch');
    const step = normalize(async () => { throw err; });
    const pipeline = new Pipeline([step]);
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.strictEqual(ex.exception, err);
  });

  it('both processor flavours work together in a pipeline', async () => {
    const fnStep = normalize(async (ex) => { ex.out.body = 'from-fn'; });
    const objStep = normalize({
      process(ex) {
        ex.in.body = ex.in.body + '-processed';
      },
    });

    const pipeline = new Pipeline([fnStep, objStep]);
    const ex = new Exchange();
    await pipeline.run(ex);

    // fnStep sets out.body → promoted to in.body; objStep appends '-processed'
    assert.equal(ex.in.body, 'from-fn-processed');
  });

  it('out→in promotion copies headers from out to in', async () => {
    const step1 = normalize(async (ex) => {
      ex.out.body = 'data';
      ex.out.setHeader('Content-Type', 'text/plain');
    });
    const pipeline = new Pipeline([step1]);
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(ex.in.body, 'data');
    assert.equal(ex.in.getHeader('Content-Type'), 'text/plain');
    assert.equal(ex.out.body, null);
    assert.equal(ex.out.getHeader('Content-Type'), undefined);
  });

  it('empty pipeline runs without error', async () => {
    const pipeline = new Pipeline([]);
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(ex.isFailed(), false);
  });
});

describe('Pipeline onException / redelivery', () => {
  it('onException clause fires when error class matches — handler called, exchange.exception null after (handled:true default)', async () => {
    let handlerCalled = false;
    const clause = {
      errorClass: TypeError,
      processor: async (ex) => { handlerCalled = true; ex.in.body = 'caught'; },
      handled: true,
    };
    const step = normalize(async () => { throw new TypeError('type error'); });
    const pipeline = new Pipeline([step], { clauses: [clause] });
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(handlerCalled, true);
    assert.equal(ex.exception, null, 'exception should be cleared when handled:true');
    assert.equal(ex.in.body, 'caught');
  });

  it('onException clause does NOT fire when error class does not match — exchange.exception set, handler not called', async () => {
    let handlerCalled = false;
    const clause = {
      errorClass: RangeError,
      processor: async () => { handlerCalled = true; },
      handled: true,
    };
    const step = normalize(async () => { throw new TypeError('type error'); });
    const pipeline = new Pipeline([step], { clauses: [clause] });
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(handlerCalled, false);
    assert.ok(ex.exception instanceof TypeError, 'exception should remain set');
  });

  it('handled:false — clause fires but exchange.exception remains set after handler', async () => {
    let handlerCalled = false;
    const err = new Error('boom');
    const clause = {
      errorClass: Error,
      processor: async () => { handlerCalled = true; },
      handled: false,
    };
    const step = normalize(async () => { throw err; });
    const pipeline = new Pipeline([step], { clauses: [clause] });
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(handlerCalled, true);
    assert.strictEqual(ex.exception, err, 'exception should remain when handled:false');
  });

  it('redelivery retries step N times before dispatching to clause — track call count', async () => {
    let callCount = 0;
    let handlerCalled = false;
    const step = normalize(async () => {
      callCount++;
      throw new Error('always fails');
    });
    const clause = {
      errorClass: Error,
      processor: async () => { handlerCalled = true; },
      handled: true,
    };
    const pipeline = new Pipeline([step], { clauses: [clause], maxAttempts: 2 });
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(callCount, 3, 'should attempt 1 + 2 retries = 3 total');
    assert.equal(handlerCalled, true);
    assert.equal(ex.exception, null);
  });

  it('redelivery: step succeeds on 2nd attempt — no clause fired, exchange.exception null', async () => {
    let callCount = 0;
    let handlerCalled = false;
    const step = normalize(async (ex) => {
      callCount++;
      if (callCount < 2) throw new Error('transient');
      ex.in.body = 'recovered';
    });
    const clause = {
      errorClass: Error,
      processor: async () => { handlerCalled = true; },
      handled: true,
    };
    const pipeline = new Pipeline([step], { clauses: [clause], maxAttempts: 2 });
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(callCount, 2, 'should succeed on 2nd attempt');
    assert.equal(handlerCalled, false, 'clause should not fire on success');
    assert.equal(ex.exception, null);
    assert.equal(ex.in.body, 'recovered');
  });
});


describe('Pipeline AbortSignal redelivery cancellation', () => {
  it('aborting signal cancels redelivery sleep — pipeline exits well before full delay', async () => {
    const controller = new AbortController();
    let callCount = 0;

    const step = normalize(async () => {
      callCount++;
      throw new Error('always fails');
    });

    // redeliveryDelay=5000ms would normally take 10s for 2 retries
    const pipeline = new Pipeline([step], {
      maxAttempts: 2,
      redeliveryDelay: 5000,
      signal: controller.signal,
    });

    const ex = new (await import('../src/Exchange.js')).Exchange();

    // Abort after a short delay (well before 5s sleep would complete)
    setTimeout(() => controller.abort(), 50);

    const start = Date.now();
    await pipeline.run(ex);
    const elapsed = Date.now() - start;

    // Should complete in well under 1s despite 5s redeliveryDelay
    assert.ok(elapsed < 1000, `expected abort within 1000ms, took ${elapsed}ms`);
    // callCount should be at least 1 (first attempt before sleep)
    assert.ok(callCount >= 1, 'step should have been called at least once');
    // exchange still has exception set
    assert.ok(ex.isFailed(), 'exchange should be failed after abort');
  });

  it('signal=null: no abort support, redelivery behaves normally', async () => {
    let callCount = 0;
    const step = normalize(async (ex) => {
      callCount++;
      if (callCount < 3) throw new Error('transient');
      ex.in.body = 'recovered';
    });

    const pipeline = new Pipeline([step], {
      maxAttempts: 2,
      redeliveryDelay: 0,
      signal: null,
    });

    const ex = new (await import('../src/Exchange.js')).Exchange();
    await pipeline.run(ex);
    assert.equal(callCount, 3);
    assert.equal(ex.in.body, 'recovered');
    assert.equal(ex.exception, null);
  });
});
