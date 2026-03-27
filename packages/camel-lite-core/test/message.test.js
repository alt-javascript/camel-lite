import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Message } from '../src/Message.js';

describe('Message', () => {
  it('constructs with a non-empty messageId', () => {
    const msg = new Message();
    assert.ok(msg.messageId, 'messageId should be truthy');
    assert.equal(typeof msg.messageId, 'string');
    assert.ok(msg.messageId.length > 0);
  });

  it('body defaults to null and can be set', () => {
    const msg = new Message();
    assert.equal(msg.body, null);
    msg.body = 'hello';
    assert.equal(msg.body, 'hello');
  });

  it('headers is a Map', () => {
    const msg = new Message();
    assert.ok(msg.headers instanceof Map);
  });

  it('setHeader and getHeader round-trip', () => {
    const msg = new Message();
    msg.setHeader('Content-Type', 'application/json');
    assert.equal(msg.getHeader('Content-Type'), 'application/json');
  });

  it('two Messages have different messageIds', () => {
    const a = new Message();
    const b = new Message();
    assert.notEqual(a.messageId, b.messageId);
  });
});
