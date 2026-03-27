import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CamelContext, CamelError } from 'camel-lite-core';
import { CronComponent, CronEndpoint } from '../src/index.js';

// ---------------------------------------------------------------------------
// Unit: endpoint parameter parsing
// ---------------------------------------------------------------------------

describe('CronEndpoint: parameter parsing', () => {
  function makeEndpoint(query) {
    const params = new URLSearchParams(query);
    // remaining = 'job', uri fabricated
    return new CronEndpoint('cron:job?' + query, 'job', params, null);
  }

  it('parses a valid 5-field schedule', () => {
    const ep = makeEndpoint('schedule=* * * * *');
    assert.equal(ep.schedule, '* * * * *');
  });

  it('parses a valid 6-field schedule', () => {
    const ep = makeEndpoint('schedule=* * * * * *');
    assert.equal(ep.schedule, '* * * * * *');
  });

  it('decodes + as space in schedule (URL encoding)', () => {
    const ep = makeEndpoint('schedule=*+*+*+*+*+*');
    assert.equal(ep.schedule, '* * * * * *');
  });

  it('defaults timezone to UTC', () => {
    const ep = makeEndpoint('schedule=* * * * *');
    assert.equal(ep.timezone, 'UTC');
  });

  it('parses custom timezone', () => {
    const ep = makeEndpoint('schedule=* * * * *&timezone=America/New_York');
    assert.equal(ep.timezone, 'America/New_York');
  });

  it('name comes from remaining path segment', () => {
    const params = new URLSearchParams('schedule=* * * * *');
    const ep = new CronEndpoint('cron:myJob?schedule=* * * * *', 'myJob', params, null);
    assert.equal(ep.name, 'myJob');
  });

  it('throws CamelError when schedule is missing', () => {
    assert.throws(() => makeEndpoint(''), /missing required.*schedule/i);
  });

  it('throws CamelError for an invalid cron expression', () => {
    assert.throws(() => makeEndpoint('schedule=not-valid'), /invalid cron expression/i);
  });
});

// ---------------------------------------------------------------------------
// Integration: fires exchanges on a fast schedule
// ---------------------------------------------------------------------------

describe('CronConsumer: fires exchanges', () => {
  it('fires on every-second schedule and headers are set', async () => {
    const ctx = new CamelContext();
    ctx.addComponent('cron', new CronComponent());

    const fired = [];
    const { RouteBuilder } = await import('camel-lite-core');
    const builder = new RouteBuilder();
    // every-second cron (6-field with seconds support)
    builder.from('cron:job?schedule=* * * * * *').process(ex => {
      fired.push({
        name: ex.in.getHeader('CamelCronName'),
        time: ex.in.getHeader('CamelCronFiredTime'),
        body: ex.in.body,
      });
    });
    ctx.addRoutes(builder);
    await ctx.start();

    // Wait 2.5 seconds — should see at least 2 fires
    await new Promise(r => setTimeout(r, 2500));
    await ctx.stop();

    assert.ok(fired.length >= 2, `expected >= 2 fires, got ${fired.length}`);
    assert.equal(fired[0].name, 'job');
    assert.ok(fired[0].time instanceof Date);
    assert.equal(fired[0].body, null);
  });

  it('stop() prevents further fires', async () => {
    const ctx = new CamelContext();
    ctx.addComponent('cron', new CronComponent());

    let fired = 0;
    const { RouteBuilder } = await import('camel-lite-core');
    const builder = new RouteBuilder();
    builder.from('cron:stopper?schedule=* * * * * *').process(() => { fired++; });
    ctx.addRoutes(builder);
    await ctx.start();

    // Let it fire at least once
    await new Promise(r => setTimeout(r, 1200));
    await ctx.stop();
    const countAtStop = fired;

    // Wait another second — should not fire more
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(fired, countAtStop, 'cron should not fire after stop');
    assert.ok(fired >= 1, 'should have fired at least once');
  });
});
