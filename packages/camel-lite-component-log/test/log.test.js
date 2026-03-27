import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Exchange } from 'camel-lite-core';
import { LogComponent, LogEndpoint, LogProducer } from 'camel-lite-component-log';

describe('LogComponent', () => {
  it('can be constructed', () => {
    const lc = new LogComponent();
    assert.ok(lc instanceof LogComponent);
  });

  it('createEndpoint returns LogEndpoint', () => {
    const lc = new LogComponent();
    const ep = lc.createEndpoint('log:myLogger', 'myLogger', {}, null);
    assert.ok(ep instanceof LogEndpoint);
    assert.equal(ep.uri, 'log:myLogger');
  });
});

describe('LogEndpoint', () => {
  it('createProducer returns LogProducer', () => {
    const ep = new LogEndpoint('log:test');
    const producer = ep.createProducer();
    assert.ok(producer instanceof LogProducer);
  });

  it('createConsumer throws', () => {
    const ep = new LogEndpoint('log:test');
    assert.throws(() => ep.createConsumer(), { message: 'log: component is producer-only' });
  });

  it('parses URI: loggerName extracted correctly — defaults to info level', () => {
    const ep = new LogEndpoint('log:myLogger');
    assert.equal(ep.loggerName, 'myLogger');
    assert.equal(ep.level, 'info');
    assert.equal(ep.showBody, true);
    assert.equal(ep.showHeaders, false);
  });

  it('parses URI: log:myLogger?level=info&showBody=false', () => {
    const ep = new LogEndpoint('log:myLogger?level=info&showBody=false');
    assert.equal(ep.loggerName, 'myLogger');
    assert.equal(ep.level, 'info');
    assert.equal(ep.showBody, false);
    assert.equal(ep.showHeaders, false);
  });

  it('parses URI: log:output?level=warn&showBody=true&showHeaders=true', () => {
    const ep = new LogEndpoint('log:output?level=warn&showBody=true&showHeaders=true');
    assert.equal(ep.loggerName, 'output');
    assert.equal(ep.level, 'warn');
    assert.equal(ep.showBody, true);
    assert.equal(ep.showHeaders, true);
  });
});

describe('LogProducer', () => {
  it('send() completes without error for a body exchange', async () => {
    const producer = new LogProducer({ level: 'info', showBody: true, loggerName: 'test' });
    const exchange = new Exchange();
    exchange.in.body = { hello: 'world' };
    await assert.doesNotReject(() => producer.send(exchange));
  });

  it('send() completes without error for debug level', async () => {
    const producer = new LogProducer({ level: 'debug', showBody: true, loggerName: 'test' });
    const exchange = new Exchange();
    exchange.in.body = 'debug payload';
    await assert.doesNotReject(() => producer.send(exchange));
  });

  it('send() completes without error when showBody=false', async () => {
    const producer = new LogProducer({ level: 'info', showBody: false, loggerName: 'test' });
    const exchange = new Exchange();
    exchange.in.body = 'secret';
    await assert.doesNotReject(() => producer.send(exchange));
  });

  it('send() completes without error when showHeaders=true', async () => {
    const producer = new LogProducer({ level: 'info', showBody: false, showHeaders: true, loggerName: 'test' });
    const exchange = new Exchange();
    exchange.in.setHeader('x-trace', 'abc123');
    await assert.doesNotReject(() => producer.send(exchange));
  });

  it('unknown level falls back to info', () => {
    const producer = new LogProducer({ level: 'trace', showBody: true, loggerName: 'test' });
    assert.equal(producer.level, 'info', 'unknown level should fall back to info');
  });

  it('log level alias falls back to info', () => {
    const producer = new LogProducer({ level: 'log', showBody: true, loggerName: 'test' });
    assert.equal(producer.level, 'info', 'log level should alias to info');
  });

  it('loggerName is used as the logger category', () => {
    const producer = new LogProducer({ level: 'info', showBody: true, loggerName: 'myRoute' });
    assert.equal(producer.loggerName, 'myRoute');
  });

  it('exchange is not mutated by send()', async () => {
    const producer = new LogProducer({ level: 'info', showBody: true, loggerName: 'test' });
    const exchange = new Exchange();
    exchange.in.body = 'unchanged';
    await producer.send(exchange);
    assert.equal(exchange.in.body, 'unchanged');
    assert.equal(exchange.exception, null);
  });
});
