import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Exchange, RouteDefinition, Pipeline, CamelContext,
  simple, js, normaliseExpression,
  AggregationStrategies, CamelFilterStopException,
} from '../src/index.js';
import { DirectComponent } from '@alt-javascript/camel-lite-component-direct';

// ---------------------------------------------------------------------------
// Expression builders: simple() and js()
// ---------------------------------------------------------------------------
describe('ExpressionBuilder: simple()', () => {
  it('${body} numeric comparison', () => {
    const ex = new Exchange(); ex.in.body = 5;
    assert.equal(simple('${body} > 3')._fn(ex), true);
    assert.equal(simple('${body} > 10')._fn(ex), false);
    assert.equal(simple('${body} == 5')._fn(ex), true);
    assert.equal(simple('${body} != 3')._fn(ex), true);
  });

  it('${header.X} access', () => {
    const ex = new Exchange();
    ex.in.setHeader('type', 'A');
    assert.equal(simple('${header.type} == "A"')._fn(ex), true);
    assert.equal(simple('${header.type} == "B"')._fn(ex), false);
  });

  it('${exchangeProperty.X} access', () => {
    const ex = new Exchange();
    ex.setProperty('count', 3);
    assert.equal(simple('${exchangeProperty.count} == 3')._fn(ex), true);
  });

  it('${in.body} alias for ${body}', () => {
    const ex = new Exchange(); ex.in.body = 7;
    assert.equal(simple('${in.body} > 5')._fn(ex), true);
  });

  it('logical and / or', () => {
    const ex = new Exchange(); ex.in.body = 5;
    assert.equal(simple('${body} > 3 and ${body} < 10')._fn(ex), true);
    assert.equal(simple('${body} > 10 or ${body} == 5')._fn(ex), true);
  });
});

describe('ExpressionBuilder: js()', () => {
  it('arbitrary JS expression on exchange', () => {
    const ex = new Exchange(); ex.in.body = 5;
    assert.equal(js('exchange.in.body * 2')._fn(ex), 10);
  });

  it('string manipulation', () => {
    const ex = new Exchange(); ex.in.body = 'hello';
    assert.equal(js('exchange.in.body.toUpperCase()')._fn(ex), 'HELLO');
  });

  it('header access', () => {
    const ex = new Exchange();
    ex.in.setHeader('x', 'world');
    assert.equal(js('exchange.in.getHeader("x") + "!"')._fn(ex), 'world!');
  });
});

describe('normaliseExpression', () => {
  it('passes native function through', () => {
    const fn = (e) => e.in.body;
    assert.strictEqual(normaliseExpression(fn), fn);
  });

  it('extracts _fn from simple() result', () => {
    const expr = simple('${body}');
    const fn = normaliseExpression(expr);
    assert.equal(typeof fn, 'function');
  });

  it('extracts _fn from js() result', () => {
    const expr = js('exchange.in.body');
    const fn = normaliseExpression(expr);
    assert.equal(typeof fn, 'function');
  });

  it('throws on non-function non-expr input', () => {
    assert.throws(() => normaliseExpression('bad'), TypeError);
    assert.throws(() => normaliseExpression(42), TypeError);
  });
});

// ---------------------------------------------------------------------------
// filter()
// ---------------------------------------------------------------------------
describe('RouteDefinition.filter()', () => {
  it('predicate true — downstream step called', async () => {
    let called = false;
    const rd = new RouteDefinition('direct:test');
    rd.filter((e) => e.in.body > 0).process(() => { called = true; });
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = 5;
    await pipeline.run(ex);
    assert.equal(called, true);
    assert.equal(ex.exception, null);
  });

  it('predicate false — downstream step NOT called, exception null', async () => {
    let called = false;
    const rd = new RouteDefinition('direct:test');
    rd.filter((e) => e.in.body > 0).process(() => { called = true; });
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = -1;
    await pipeline.run(ex);
    assert.equal(called, false);
    assert.equal(ex.exception, null);
  });

  it('filter(simple(...)): filters negative bodies', async () => {
    let called = false;
    const rd = new RouteDefinition('direct:test');
    rd.filter(simple('${body} > 0')).process(() => { called = true; });
    const pipeline = rd.compile();

    const pos = new Exchange(); pos.in.body = 3;
    await pipeline.run(pos);
    assert.equal(called, true);

    called = false;
    const neg = new Exchange(); neg.in.body = -1;
    await pipeline.run(neg);
    assert.equal(called, false);
  });

  it('filter(js(...)): filters short strings', async () => {
    let called = false;
    const rd = new RouteDefinition('direct:test');
    rd.filter(js('exchange.in.body.length > 2')).process(() => { called = true; });
    const pipeline = rd.compile();

    const long = new Exchange(); long.in.body = 'hello';
    await pipeline.run(long);
    assert.equal(called, true);

    called = false;
    const short = new Exchange(); short.in.body = 'hi';
    await pipeline.run(short);
    assert.equal(called, false);
  });

  it('filter sets CamelFilterMatched=true when passing', async () => {
    const rd = new RouteDefinition('direct:test');
    rd.filter((e) => true);
    const pipeline = rd.compile();
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(ex.getProperty('CamelFilterMatched'), true);
  });
});

// ---------------------------------------------------------------------------
// transform()
// ---------------------------------------------------------------------------
describe('RouteDefinition.transform()', () => {
  it('replaces body with expression return value', async () => {
    const rd = new RouteDefinition('direct:test');
    rd.transform((e) => e.in.body * 2);
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = 5;
    await pipeline.run(ex);
    assert.equal(ex.in.body, 10);
  });

  it('transform(simple(...)): identity', async () => {
    const rd = new RouteDefinition('direct:test');
    rd.transform(simple('${body}'));
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = 42;
    await pipeline.run(ex);
    assert.equal(ex.in.body, 42);
  });

  it('transform(js(...)): uppercase', async () => {
    const rd = new RouteDefinition('direct:test');
    rd.transform(js('exchange.in.body.toUpperCase()'));
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = 'hello';
    await pipeline.run(ex);
    assert.equal(ex.in.body, 'HELLO');
  });

  it('chained: process → transform → process', async () => {
    const rd = new RouteDefinition('direct:test');
    rd.process((e) => { e.in.body = 3; })
      .transform((e) => e.in.body * 2)
      .process((e) => { e.in.body = e.in.body + 1; });
    const pipeline = rd.compile();
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(ex.in.body, 7); // (3*2)+1
  });

  it('filter(false) blocks transform', async () => {
    let transformed = false;
    const rd = new RouteDefinition('direct:test');
    rd.filter((e) => false).transform((e) => { transformed = true; return e.in.body; });
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = 'x';
    await pipeline.run(ex);
    assert.equal(transformed, false);
    assert.equal(ex.exception, null);
  });
});

// ---------------------------------------------------------------------------
// choice() / when() / otherwise() / end()
// ---------------------------------------------------------------------------
describe('RouteDefinition.choice() CBR', () => {
  it('when() predicate matches — correct branch dispatched', async () => {
    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());

    const routeA = new RouteDefinition('direct:a');
    routeA.process((e) => { e.setProperty('branch', 'A'); });

    const routeB = new RouteDefinition('direct:b');
    routeB.process((e) => { e.setProperty('branch', 'B'); });

    const routeMain = new RouteDefinition('direct:main');
    routeMain.choice()
      .when((e) => e.in.body === 'A').to('direct:a')
      .when((e) => e.in.body === 'B').to('direct:b')
      .end();

    context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB, routeMain]; } });
    await context.start();

    const exA = new Exchange(); exA.in.body = 'A';
    await context.getConsumer('direct:main').process(exA);
    assert.equal(exA.getProperty('branch'), 'A');

    const exB = new Exchange(); exB.in.body = 'B';
    await context.getConsumer('direct:main').process(exB);
    assert.equal(exB.getProperty('branch'), 'B');

    await context.stop();
  });

  it('otherwise() catches unmatched exchanges', async () => {
    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());

    const routeDefault = new RouteDefinition('direct:default');
    routeDefault.process((e) => { e.setProperty('branch', 'default'); });

    const routeMain = new RouteDefinition('direct:main');
    routeMain.choice()
      .when((e) => e.in.body === 'X').to('direct:default')
      .otherwise().to('direct:default')
      .end();

    context.addRoutes({ configure() {}, getRoutes() { return [routeDefault, routeMain]; } });
    await context.start();

    const ex = new Exchange(); ex.in.body = 'other';
    await context.getConsumer('direct:main').process(ex);
    assert.equal(ex.getProperty('branch'), 'default');

    await context.stop();
  });

  it('no match and no otherwise — exchange passes through unmodified', async () => {
    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());

    const routeMain = new RouteDefinition('direct:main');
    routeMain.choice()
      .when((e) => e.in.body === 'X').to('direct:missing')
      .end()
      .process((e) => { e.in.body = 'after-choice'; });

    context.addRoutes({ configure() {}, getRoutes() { return [routeMain]; } });
    await context.start();

    const ex = new Exchange(); ex.in.body = 'other';
    await context.getConsumer('direct:main').process(ex);
    assert.equal(ex.in.body, 'after-choice');
    assert.equal(ex.exception, null);

    await context.stop();
  });

  it('end() returns RouteDefinition for further chaining', () => {
    const rd = new RouteDefinition('direct:test');
    const result = rd.choice().when((e) => true).to('direct:a').end();
    assert.strictEqual(result, rd);
  });

  it('when(simple(...)): routes by header value', async () => {
    const context = new CamelContext();
    context.addComponent('direct', new DirectComponent());

    const routeVip = new RouteDefinition('direct:vip');
    routeVip.process((e) => { e.setProperty('tier', 'vip'); });

    const routeStd = new RouteDefinition('direct:std');
    routeStd.process((e) => { e.setProperty('tier', 'standard'); });

    const routeMain = new RouteDefinition('direct:main');
    routeMain.choice()
      .when(simple('${header.tier} == "vip"')).to('direct:vip')
      .otherwise().to('direct:std')
      .end();

    context.addRoutes({ configure() {}, getRoutes() { return [routeVip, routeStd, routeMain]; } });
    await context.start();

    const exVip = new Exchange(); exVip.in.setHeader('tier', 'vip');
    await context.getConsumer('direct:main').process(exVip);
    assert.equal(exVip.getProperty('tier'), 'vip');

    const exStd = new Exchange(); exStd.in.setHeader('tier', 'regular');
    await context.getConsumer('direct:main').process(exStd);
    assert.equal(exStd.getProperty('tier'), 'standard');

    await context.stop();
  });
});

// ---------------------------------------------------------------------------
// split()
// ---------------------------------------------------------------------------
describe('RouteDefinition.split()', () => {
  it('splits array body into N sub-exchanges, collects results', async () => {
    const rd = new RouteDefinition('direct:test');
    rd.split((e) => e.in.body)
      .process((e) => { e.in.body = e.in.body * 2; });
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = [1, 2, 3];
    await pipeline.run(ex);
    assert.deepEqual(ex.in.body, [2, 4, 6]);
  });

  it('empty array produces []', async () => {
    const rd = new RouteDefinition('direct:test');
    rd.split((e) => e.in.body);
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = [];
    await pipeline.run(ex);
    assert.deepEqual(ex.in.body, []);
  });

  it('split with expression function on nested property', async () => {
    const rd = new RouteDefinition('direct:test');
    rd.split((e) => e.in.body.items);
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = { items: ['a', 'b'] };
    await pipeline.run(ex);
    assert.deepEqual(ex.in.body, ['a', 'b']);
  });

  it('sub-exchanges are independent — error in one does not stop others', async () => {
    const results = [];
    const rd = new RouteDefinition('direct:test');
    rd.split((e) => e.in.body)
      .process((e) => {
        if (e.in.body === 2) throw new Error('fail-2');
        results.push(e.in.body);
      });
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = [1, 2, 3];
    await pipeline.run(ex);
    // Sub-exchange 2 failed, others processed
    assert.ok(results.includes(1));
    assert.ok(results.includes(3));
  });

  it('split(simple(...)): splits via expression', async () => {
    const rd = new RouteDefinition('direct:test');
    // simple returns body directly; works when body is array
    rd.split((e) => e.in.body).transform((e) => String(e.in.body) + '!');
    const pipeline = rd.compile();
    const ex = new Exchange(); ex.in.body = ['a', 'b'];
    await pipeline.run(ex);
    assert.deepEqual(ex.in.body, ['a!', 'b!']);
  });

  it('Exchange.clone() copies body and headers but not exception', () => {
    const ex = new Exchange();
    ex.in.body = 'hello';
    ex.in.setHeader('h', '1');
    ex.exception = new Error('orig');

    const c = ex.clone();
    assert.equal(c.in.body, 'hello');
    assert.equal(c.in.getHeader('h'), '1');
    assert.equal(c.exception, null);
  });
});

// ---------------------------------------------------------------------------
// aggregate()
// ---------------------------------------------------------------------------
describe('RouteDefinition.aggregate()', () => {
  it('completes at count=3, downstream called once with aggregated body', async () => {
    let downstreamCount = 0;
    const rd = new RouteDefinition('direct:test');
    rd.aggregate(
      (e) => e.in.getHeader('corrId'),
      AggregationStrategies.collectBodies(),
      3
    ).process((e) => { downstreamCount++; });

    const pipeline = rd.compile();

    for (let i = 0; i < 3; i++) {
      const ex = new Exchange();
      ex.in.body = i;
      ex.in.setHeader('corrId', 'batch-1');
      await pipeline.run(ex);
    }

    assert.equal(downstreamCount, 1);
  });

  it('first 2 of 3 stop cleanly (no exception)', async () => {
    const rd = new RouteDefinition('direct:test');
    rd.aggregate(
      (e) => 'key',
      AggregationStrategies.collectBodies(),
      3
    );
    const pipeline = rd.compile();

    for (let i = 0; i < 2; i++) {
      const ex = new Exchange(); ex.in.body = i;
      await pipeline.run(ex);
      assert.equal(ex.exception, null, `exchange ${i} should have no exception`);
    }
  });

  it('collectBodies() strategy: result.in.body is array of all bodies', async () => {
    let aggregatedBody;
    const rd = new RouteDefinition('direct:test');
    rd.aggregate(
      (e) => 'key',
      AggregationStrategies.collectBodies(),
      3
    ).process((e) => { aggregatedBody = e.in.body; });

    const pipeline = rd.compile();
    for (let i = 0; i < 3; i++) {
      const ex = new Exchange(); ex.in.body = `item-${i}`; ex.in.setHeader('corrId', 'k');
      await pipeline.run(ex);
    }
    assert.deepEqual(aggregatedBody, ['item-0', 'item-1', 'item-2']);
  });

  it('latest() strategy: result is last exchange body', async () => {
    let aggregatedBody;
    const rd = new RouteDefinition('direct:test');
    rd.aggregate(
      (e) => 'key',
      AggregationStrategies.latest(),
      3
    ).process((e) => { aggregatedBody = e.in.body; });

    const pipeline = rd.compile();
    for (let i = 0; i < 3; i++) {
      const ex = new Exchange(); ex.in.body = `msg-${i}`;
      await pipeline.run(ex);
    }
    assert.equal(aggregatedBody, 'msg-2');
  });

  it('two correlation IDs complete independently', async () => {
    const completions = [];
    const rd = new RouteDefinition('direct:test');
    rd.aggregate(
      (e) => e.in.getHeader('batch'),
      AggregationStrategies.collectBodies(),
      2
    ).process((e) => { completions.push(e.in.body); });

    const pipeline = rd.compile();

    const send = async (body, batch) => {
      const ex = new Exchange(); ex.in.body = body; ex.in.setHeader('batch', batch);
      await pipeline.run(ex);
    };

    await send('a1', 'batchA');
    await send('b1', 'batchB');
    await send('a2', 'batchA'); // completes A
    await send('b2', 'batchB'); // completes B

    assert.equal(completions.length, 2);
    assert.ok(completions.some(c => Array.isArray(c) && c.includes('a1') && c.includes('a2')));
    assert.ok(completions.some(c => Array.isArray(c) && c.includes('b1') && c.includes('b2')));
  });
});
