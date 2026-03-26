import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Exchange, Message, MammalContext, Component } from 'mammal-core';
import { DirectComponent } from 'mammal-component-direct';

describe('cross-package import integration', () => {
  it('Exchange imported from mammal-core constructs correctly', () => {
    const ex = new Exchange();
    assert.equal(ex.pattern, 'InOnly');
    assert.ok(ex.in instanceof Message);
  });

  it('Message has a messageId', () => {
    const msg = new Message();
    assert.ok(typeof msg.messageId === 'string');
    assert.ok(msg.messageId.length > 0);
  });

  it('DirectComponent is a subclass of Component', () => {
    const dc = new DirectComponent();
    assert.ok(dc instanceof Component);
  });

  it('DirectComponent.createEndpoint throws the expected error', () => {
    const dc = new DirectComponent();
    assert.throws(() => dc.createEndpoint('direct://foo', 'foo', {}, null), {
      message: 'DirectComponent not yet implemented',
    });
  });
});
