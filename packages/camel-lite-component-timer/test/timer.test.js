import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CamelContext } from 'camel-lite-core';
import { TimerComponent, TimerEndpoint } from '../src/index.js';

// ---------------------------------------------------------------------------
// Unit: endpoint parameter parsing
// ---------------------------------------------------------------------------

describe('TimerEndpoint: parameter parsing', () => {
  function makeEndpoint(query) {
    const params = new URLSearchParams(query);
    return new TimerEndpoint('timer:tick?' + query, 'tick', params, null);
  }

  it('defaults: period=1000 delay=0 repeatCount=0', () => {
    const ep = makeEndpoint('');
    assert.equal(ep.period, 1000);
    assert.equal(ep.delay, 0);
    assert.equal(ep.repeatCount, 0);
  });

  it('parses period', () => {
    const ep = makeEndpoint('period=250');
    assert.equal(ep.period, 250);
  });

  it('parses delay', () => {
    const ep = makeEndpoint('delay=500');
    assert.equal(ep.delay, 500);
  });

  it('parses repeatCount', () => {
    const ep = makeEndpoint('repeatCount=5');
    assert.equal(ep.repeatCount, 5);
  });

  it('name comes from remaining path segment', () => {
    const ep = new TimerEndpoint('timer:myTimer', 'myTimer', new URLSearchParams(), null);
    assert.equal(ep.name, 'myTimer');
  });

  it('clamps period to minimum 1ms', () => {
    const ep = makeEndpoint('period=0');
    assert.equal(ep.period, 1);
  });
});

// ---------------------------------------------------------------------------
// Integration: fire exchanges
// ---------------------------------------------------------------------------

describe('TimerConsumer: fires exchanges', () => {
  it('fires repeatCount exchanges then stops', async () => {
    const ctx = new CamelContext();
    ctx.addComponent('timer', new TimerComponent());

    const fired = [];
    const { RouteBuilder } = await import('camel-lite-core');
    const builder = new RouteBuilder();
    builder.from('timer:tick?period=30&repeatCount=3').process(ex => {
      fired.push({
        name: ex.in.getHeader('CamelTimerName'),
        counter: ex.in.getHeader('CamelTimerCounter'),
        time: ex.in.getHeader('CamelTimerFiredTime'),
        body: ex.in.body,
      });
    });
    ctx.addRoutes(builder);
    await ctx.start();

    // Wait for all 3 fires + margin
    await new Promise(r => setTimeout(r, 200));
    await ctx.stop();

    assert.equal(fired.length, 3, `expected 3 fires, got ${fired.length}`);
    assert.equal(fired[0].name, 'tick');
    assert.equal(fired[0].counter, 1);
    assert.equal(fired[1].counter, 2);
    assert.equal(fired[2].counter, 3);
    assert.equal(fired[0].body, null);
    assert.ok(fired[0].time instanceof Date);
  });

  it('stop() cancels an infinite timer before repeatCount fires', async () => {
    const ctx = new CamelContext();
    ctx.addComponent('timer', new TimerComponent());

    let fired = 0;
    const { RouteBuilder } = await import('camel-lite-core');
    const builder = new RouteBuilder();
    builder.from('timer:stopper?period=50').process(() => { fired++; });
    ctx.addRoutes(builder);
    await ctx.start();

    // Let it fire a few times
    await new Promise(r => setTimeout(r, 80));
    await ctx.stop();
    const countAtStop = fired;

    // Wait a bit more — should not fire after stop
    await new Promise(r => setTimeout(r, 100));
    assert.equal(fired, countAtStop, 'timer should not fire after stop');
    assert.ok(fired >= 1, 'should have fired at least once before stop');
  });

  it('delay defers the first fire', async () => {
    const ctx = new CamelContext();
    ctx.addComponent('timer', new TimerComponent());

    const times = [];
    const start = Date.now();
    const { RouteBuilder } = await import('camel-lite-core');
    const builder = new RouteBuilder();
    builder.from('timer:delayed?period=1000&delay=150&repeatCount=1').process(() => {
      times.push(Date.now() - start);
    });
    ctx.addRoutes(builder);
    await ctx.start();

    await new Promise(r => setTimeout(r, 300));
    await ctx.stop();

    assert.equal(times.length, 1);
    assert.ok(times[0] >= 100, `expected delay >= 100ms, got ${times[0]}ms`);
  });

  it('CamelTimerFiredTime is a Date instance', async () => {
    const ctx = new CamelContext();
    ctx.addComponent('timer', new TimerComponent());

    let firedTime;
    const { RouteBuilder } = await import('camel-lite-core');
    const builder = new RouteBuilder();
    builder.from('timer:ts?period=50&repeatCount=1').process(ex => {
      firedTime = ex.in.getHeader('CamelTimerFiredTime');
    });
    ctx.addRoutes(builder);
    await ctx.start();
    await new Promise(r => setTimeout(r, 150));
    await ctx.stop();

    assert.ok(firedTime instanceof Date);
  });
});
