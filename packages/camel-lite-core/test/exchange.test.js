import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Exchange } from '../src/Exchange.js';
import { Message } from '../src/Message.js';

describe('Exchange', () => {
  it('constructs with default pattern InOnly', () => {
    const ex = new Exchange();
    assert.equal(ex.pattern, 'InOnly');
  });

  it('in and out are Message instances', () => {
    const ex = new Exchange();
    assert.ok(ex.in instanceof Message);
    assert.ok(ex.out instanceof Message);
  });

  it('properties Map works via setProperty/getProperty', () => {
    const ex = new Exchange();
    assert.ok(ex.properties instanceof Map);
    ex.setProperty('foo', 'bar');
    assert.equal(ex.getProperty('foo'), 'bar');
  });

  it('exception defaults to null and isFailed() is false', () => {
    const ex = new Exchange();
    assert.equal(ex.exception, null);
    assert.equal(ex.isFailed(), false);
  });

  it('setting exception makes isFailed() return true', () => {
    const ex = new Exchange();
    ex.exception = new Error('boom');
    assert.equal(ex.isFailed(), true);
    assert.ok(ex.exception instanceof Error);
  });

  it('supports InOut pattern', () => {
    const ex = new Exchange('InOut');
    assert.equal(ex.pattern, 'InOut');
  });
});
