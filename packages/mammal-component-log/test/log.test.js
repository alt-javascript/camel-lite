import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Exchange } from 'mammal-core';
import { LogComponent, LogEndpoint, LogProducer } from 'mammal-component-log';

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

  it('parses URI: loggerName extracted correctly', () => {
    const ep = new LogEndpoint('log:myLogger');
    assert.equal(ep.loggerName, 'myLogger');
    assert.equal(ep.level, 'log');
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

  it('parses URI: log:output?level=log&showBody=true&showHeaders=true', () => {
    const ep = new LogEndpoint('log:output?level=log&showBody=true&showHeaders=true');
    assert.equal(ep.loggerName, 'output');
    assert.equal(ep.level, 'log');
    assert.equal(ep.showBody, true);
    assert.equal(ep.showHeaders, true);
  });
});

describe('LogProducer', () => {
  it('send() calls console.log with body content', async () => {
    const producer = new LogProducer({ level: 'log', showBody: true, loggerName: 'test' });
    const exchange = new Exchange();
    exchange.in.body = { hello: 'world' };

    const calls = [];
    const origLog = console.log;
    console.log = (...args) => calls.push(args);

    try {
      await producer.send(exchange);
    } finally {
      console.log = origLog;
    }

    assert.equal(calls.length, 1);
    assert.ok(calls[0][0].includes('hello'), `expected body in message, got: ${calls[0][0]}`);
  });

  it('send() respects level param — uses console.info when level=info', async () => {
    const producer = new LogProducer({ level: 'info', showBody: true, loggerName: 'test' });
    const exchange = new Exchange();
    exchange.in.body = 'ping';

    const infoCalls = [];
    const origInfo = console.info;
    console.info = (...args) => infoCalls.push(args);

    const logCalls = [];
    const origLog = console.log;
    console.log = (...args) => logCalls.push(args);

    try {
      await producer.send(exchange);
    } finally {
      console.info = origInfo;
      console.log = origLog;
    }

    assert.equal(infoCalls.length, 1, 'console.info should have been called once');
    assert.equal(logCalls.length, 0, 'console.log should not have been called');
  });

  it('send() showBody=false suppresses body in output', async () => {
    const producer = new LogProducer({ level: 'log', showBody: false, loggerName: 'test' });
    const exchange = new Exchange();
    exchange.in.body = 'secret';

    const calls = [];
    const origLog = console.log;
    console.log = (...args) => calls.push(args);

    try {
      await producer.send(exchange);
    } finally {
      console.log = origLog;
    }

    assert.equal(calls.length, 1);
    assert.ok(!calls[0][0].includes('secret'), 'body should not appear in output');
  });

  it('send() includes headers when showHeaders=true', async () => {
    const producer = new LogProducer({ level: 'log', showBody: false, showHeaders: true, loggerName: 'test' });
    const exchange = new Exchange();
    exchange.in.setHeader('x-trace', 'abc123');

    const calls = [];
    const origLog = console.log;
    console.log = (...args) => calls.push(args);

    try {
      await producer.send(exchange);
    } finally {
      console.log = origLog;
    }

    assert.equal(calls.length, 1);
    assert.ok(calls[0][0].includes('abc123'), `expected header value in message, got: ${calls[0][0]}`);
  });

  it('send() defaults to level=log for unknown level', async () => {
    const producer = new LogProducer({ level: 'trace', showBody: true, loggerName: 'test' });
    assert.equal(producer.level, 'log', 'unknown level should fall back to log');
  });
});
