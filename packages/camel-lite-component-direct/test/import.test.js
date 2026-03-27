import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Exchange, Message, CamelContext, Component, Pipeline, CycleDetectedError } from '@alt-javascript/camel-lite-core';
import { DirectComponent, DirectEndpoint, DirectProducer, DirectConsumer } from '@alt-javascript/camel-lite-component-direct';

describe('cross-package import integration', () => {
  it('Exchange imported from camel-lite-core constructs correctly', () => {
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

  it('DirectComponent.createEndpoint returns a DirectEndpoint', () => {
    const dc = new DirectComponent();
    const ctx = new CamelContext();
    const ep = dc.createEndpoint('direct:foo', 'foo', {}, ctx);
    assert.ok(ep instanceof DirectEndpoint);
  });
});
