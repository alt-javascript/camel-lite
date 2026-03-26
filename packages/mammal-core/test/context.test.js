import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MammalContext } from '../src/MammalContext.js';

describe('MammalContext', () => {
  it('constructs without error', () => {
    const ctx = new MammalContext();
    assert.ok(ctx instanceof MammalContext);
  });

  it('started is false initially', () => {
    const ctx = new MammalContext();
    assert.equal(ctx.started, false);
  });

  it('start() is async and sets started to true', async () => {
    const ctx = new MammalContext();
    await ctx.start();
    assert.equal(ctx.started, true);
  });

  it('stop() sets started to false', async () => {
    const ctx = new MammalContext();
    await ctx.start();
    await ctx.stop();
    assert.equal(ctx.started, false);
  });

  it('addComponent returns this (fluent)', () => {
    const ctx = new MammalContext();
    const stub = {};
    const result = ctx.addComponent('test', stub);
    assert.equal(result, ctx);
  });

  it('getComponent returns the registered component', () => {
    const ctx = new MammalContext();
    const stub = { name: 'stubComponent' };
    ctx.addComponent('direct', stub);
    assert.equal(ctx.getComponent('direct'), stub);
  });

  it('addComponent is chainable', () => {
    const ctx = new MammalContext();
    const a = { id: 'a' };
    const b = { id: 'b' };
    ctx.addComponent('a', a).addComponent('b', b);
    assert.equal(ctx.getComponent('a'), a);
    assert.equal(ctx.getComponent('b'), b);
  });
});
