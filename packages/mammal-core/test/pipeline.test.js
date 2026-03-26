import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/ProcessorNormalizer.js';
import { Pipeline } from '../src/Pipeline.js';
import MammalError from '../src/errors/MammalError.js';
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

  it('throws MammalError on null input', () => {
    assert.throws(() => normalize(null), (err) => {
      assert.ok(err instanceof MammalError);
      assert.equal(err.name, 'MammalError');
      return true;
    });
  });

  it('throws MammalError on a plain object without process()', () => {
    assert.throws(() => normalize({ foo: 'bar' }), (err) => {
      assert.ok(err instanceof MammalError);
      return true;
    });
  });

  it('throws MammalError on a number', () => {
    assert.throws(() => normalize(42), (err) => {
      assert.ok(err instanceof MammalError);
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
