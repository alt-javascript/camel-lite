import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Exchange, Message, CamelContext, Component, Pipeline, SedaQueueFullError } from 'camel-lite-core';
import { SedaComponent, SedaEndpoint, SedaProducer, SedaConsumer, SedaQueue } from 'camel-lite-component-seda';

describe('cross-package import integration', () => {
  it('Exchange imported from camel-lite-core constructs correctly', () => {
    const ex = new Exchange();
    assert.equal(ex.pattern, 'InOnly');
    assert.ok(ex.in instanceof Message);
  });

  it('SedaComponent is a subclass of Component', () => {
    const c = new SedaComponent();
    assert.ok(c instanceof Component);
  });

  it('SedaQueueFullError imported from camel-lite-core', () => {
    const err = new SedaQueueFullError(5);
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'SedaQueueFullError');
    assert.equal(err.maxSize, 5);
  });

  it('SedaComponent.createEndpoint returns a SedaEndpoint', () => {
    const c = new SedaComponent();
    const ctx = new CamelContext();
    const ep = c.createEndpoint('seda:test', 'test', new URLSearchParams(), ctx);
    assert.ok(ep instanceof SedaEndpoint);
  });

  it('SedaEndpoint.createProducer returns SedaProducer', () => {
    const ctx = new CamelContext();
    const ep = new SedaEndpoint('seda:test', 'test', new URLSearchParams(), ctx);
    assert.ok(ep.createProducer() instanceof SedaProducer);
  });

  it('SedaEndpoint.createConsumer returns SedaConsumer', () => {
    const ctx = new CamelContext();
    const ep = new SedaEndpoint('seda:test', 'test', new URLSearchParams(), ctx);
    assert.ok(ep.createConsumer(new Pipeline([])) instanceof SedaConsumer);
  });
});
