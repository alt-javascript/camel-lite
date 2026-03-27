import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CamelContext } from '../src/CamelContext.js';

describe('CamelContext', () => {
  it('constructs without error', () => {
    const ctx = new CamelContext();
    assert.ok(ctx instanceof CamelContext);
  });

  it('started is false initially', () => {
    const ctx = new CamelContext();
    assert.equal(ctx.started, false);
  });

  it('start() is async and sets started to true', async () => {
    const ctx = new CamelContext();
    await ctx.start();
    assert.equal(ctx.started, true);
  });

  it('stop() sets started to false', async () => {
    const ctx = new CamelContext();
    await ctx.start();
    await ctx.stop();
    assert.equal(ctx.started, false);
  });

  it('addComponent returns this (fluent)', () => {
    const ctx = new CamelContext();
    const stub = {};
    const result = ctx.addComponent('test', stub);
    assert.equal(result, ctx);
  });

  it('getComponent returns the registered component', () => {
    const ctx = new CamelContext();
    const stub = { name: 'stubComponent' };
    ctx.addComponent('direct', stub);
    assert.equal(ctx.getComponent('direct'), stub);
  });

  it('addComponent is chainable', () => {
    const ctx = new CamelContext();
    const a = { id: 'a' };
    const b = { id: 'b' };
    ctx.addComponent('a', a).addComponent('b', b);
    assert.equal(ctx.getComponent('a'), a);
    assert.equal(ctx.getComponent('b'), b);
  });
});

describe('CamelContext bean registry', () => {
  it('registerBean/getBean round-trips a bean by name', () => {
    const ctx = new CamelContext();
    const db = { type: 'sqlite' };
    ctx.registerBean('myDb', db);
    assert.equal(ctx.getBean('myDb'), db);
  });

  it('getBean returns undefined for unknown name', () => {
    const ctx = new CamelContext();
    assert.equal(ctx.getBean('ghost'), undefined);
  });

  it('getBeans returns all registered beans as [name, bean] pairs', () => {
    const ctx = new CamelContext();
    const db1 = { id: 1 };
    const db2 = { id: 2 };
    ctx.registerBean('ds1', db1);
    ctx.registerBean('ds2', db2);
    const entries = ctx.getBeans();
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.find(([n]) => n === 'ds1')?.[1], db1);
    assert.deepEqual(entries.find(([n]) => n === 'ds2')?.[1], db2);
  });

  it('getBeans returns empty array when no beans registered', () => {
    const ctx = new CamelContext();
    assert.deepEqual(ctx.getBeans(), []);
  });

  it('registerBean is fluent (returns context)', () => {
    const ctx = new CamelContext();
    const result = ctx.registerBean('x', {});
    assert.equal(result, ctx);
  });

  it('registerBean overwrites existing bean with same name', () => {
    const ctx = new CamelContext();
    const orig = { v: 1 };
    const updated = { v: 2 };
    ctx.registerBean('key', orig);
    ctx.registerBean('key', updated);
    assert.equal(ctx.getBean('key'), updated);
  });
});
