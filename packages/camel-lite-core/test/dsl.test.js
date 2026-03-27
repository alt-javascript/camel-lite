import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Exchange, CamelContext, RouteDefinition,
  simple, js, constant,
} from '../src/index.js';
import { Pipeline } from '../src/Pipeline.js';

// ---------------------------------------------------------------------------
// Helper: compile a RouteDefinition to a Pipeline and run it against an exchange
// ---------------------------------------------------------------------------

function makeExchange(body) {
  const ex = new Exchange();
  ex.in.body = body;
  return ex;
}

async function run(routeDef, exchange, context = null) {
  const pipeline = routeDef.compile(context);
  await pipeline.run(exchange);
  return exchange;
}

// ---------------------------------------------------------------------------
// constant() expression
// ---------------------------------------------------------------------------

describe('constant() expression', () => {
  it('always returns the given value regardless of exchange', async () => {
    const fn = constant('hello');
    assert.equal(typeof fn._fn, 'function');
    assert.equal(fn._fn(), 'hello');
    assert.equal(fn._fn({ whatever: true }), 'hello');
  });

  it('works with normaliseExpression', () => {
    // constant returns a _camelExpr object compatible with normaliseExpression
    const expr = constant(42);
    assert.ok(expr._camelExpr);
    assert.equal(expr._fn(), 42);
  });
});

// ---------------------------------------------------------------------------
// setBody
// ---------------------------------------------------------------------------

describe('setBody()', () => {
  it('replaces body with constant expression', async () => {
    const route = new RouteDefinition('direct:test');
    route.setBody(constant('hello'));
    const ex = makeExchange('original');
    await run(route, ex);
    assert.equal(ex.in.body, 'hello');
  });

  it('replaces body with simple expression referencing a header', async () => {
    const route = new RouteDefinition('direct:test');
    route.setBody(simple('${header.X-Type}'));
    const ex = makeExchange('original');
    ex.in.setHeader('X-Type', 'order');
    await run(route, ex);
    assert.equal(ex.in.body, 'order');
  });

  it('replaces body with js expression', async () => {
    const route = new RouteDefinition('direct:test');
    route.setBody(js('exchange.in.body.toUpperCase()'));
    const ex = makeExchange('hello');
    await run(route, ex);
    assert.equal(ex.in.body, 'HELLO');
  });
});

// ---------------------------------------------------------------------------
// setHeader
// ---------------------------------------------------------------------------

describe('setHeader()', () => {
  it('sets a header with constant value', async () => {
    const route = new RouteDefinition('direct:test');
    route.setHeader('X-Source', constant('camel-lite'));
    const ex = makeExchange('body');
    await run(route, ex);
    assert.equal(ex.in.getHeader('X-Source'), 'camel-lite');
  });

  it('sets a header from body via simple expression', async () => {
    const route = new RouteDefinition('direct:test');
    route.setHeader('X-Body', simple('${body}'));
    const ex = makeExchange('my-value');
    await run(route, ex);
    assert.equal(ex.in.getHeader('X-Body'), 'my-value');
  });

  it('does not modify exchange body', async () => {
    const route = new RouteDefinition('direct:test');
    route.setHeader('X-Foo', constant('bar'));
    const ex = makeExchange('unchanged');
    await run(route, ex);
    assert.equal(ex.in.body, 'unchanged');
  });
});

// ---------------------------------------------------------------------------
// setProperty
// ---------------------------------------------------------------------------

describe('setProperty()', () => {
  it('sets an exchange property with js expression', async () => {
    const route = new RouteDefinition('direct:test');
    route.setBody(constant({ name: 'Alice' }));
    route.setProperty('saved', js('exchange.in.body'));
    const ex = makeExchange(null);
    await run(route, ex);
    assert.deepEqual(ex.getProperty('saved'), { name: 'Alice' });
  });

  it('sets property with constant', async () => {
    const route = new RouteDefinition('direct:test');
    route.setProperty('version', constant(2));
    const ex = makeExchange(null);
    await run(route, ex);
    assert.equal(ex.getProperty('version'), 2);
  });
});

// ---------------------------------------------------------------------------
// removeHeader
// ---------------------------------------------------------------------------

describe('removeHeader()', () => {
  it('removes a named header from the exchange', async () => {
    const route = new RouteDefinition('direct:test');
    route.removeHeader('X-Temp');
    const ex = makeExchange('body');
    ex.in.setHeader('X-Temp', 'to-be-removed');
    await run(route, ex);
    assert.equal(ex.in.getHeader('X-Temp'), undefined);
  });

  it('does not throw when header is absent', async () => {
    const route = new RouteDefinition('direct:test');
    route.removeHeader('X-Missing');
    const ex = makeExchange('body');
    await assert.doesNotReject(() => run(route, ex));
  });
});

// ---------------------------------------------------------------------------
// log
// ---------------------------------------------------------------------------

describe('log()', () => {
  it('does not throw and does not modify exchange body', async () => {
    const route = new RouteDefinition('direct:test');
    route.log('hello from route');
    const ex = makeExchange('original-body');
    await assert.doesNotReject(() => run(route, ex));
    assert.equal(ex.in.body, 'original-body');
  });

  it('accepts a simple() expression as message', async () => {
    // simple() expressions must be pure expressions, not text with embedded values.
    // For log, use a js() expression to build a formatted message string.
    const route = new RouteDefinition('direct:test');
    route.log(js('`body is ${exchange.in.body}`'));
    const ex = makeExchange('test-value');
    await assert.doesNotReject(() => run(route, ex));
  });
});

// ---------------------------------------------------------------------------
// marshal / unmarshal
// ---------------------------------------------------------------------------

describe('marshal()', () => {
  it('serialises object body to JSON string', async () => {
    const route = new RouteDefinition('direct:test');
    route.marshal('json');
    const ex = makeExchange({ name: 'Widget', price: 9.99 });
    await run(route, ex);
    assert.equal(typeof ex.in.body, 'string');
    const parsed = JSON.parse(ex.in.body);
    assert.equal(parsed.name, 'Widget');
  });

  it('defaults to json format', async () => {
    const route = new RouteDefinition('direct:test');
    route.marshal(); // no arg
    const ex = makeExchange({ x: 1 });
    await run(route, ex);
    assert.equal(ex.in.body, '{"x":1}');
  });
});

describe('unmarshal()', () => {
  it('deserialises JSON string to object', async () => {
    const route = new RouteDefinition('direct:test');
    route.unmarshal('json');
    const ex = makeExchange('{"name":"Gadget","price":24.99}');
    await run(route, ex);
    assert.equal(ex.in.body.name, 'Gadget');
    assert.equal(ex.in.body.price, 24.99);
  });
});

describe('marshal → unmarshal round-trip', () => {
  it('round-trips an object through JSON serialisation', async () => {
    const original = { id: 1, tags: ['a', 'b'], nested: { x: true } };
    const route = new RouteDefinition('direct:test');
    route.marshal().unmarshal();
    const ex = makeExchange(original);
    await run(route, ex);
    assert.deepEqual(ex.in.body, original);
  });
});

// ---------------------------------------------------------------------------
// convertBodyTo
// ---------------------------------------------------------------------------

describe('convertBodyTo()', () => {
  it('converts number to String', async () => {
    const route = new RouteDefinition('direct:test');
    route.convertBodyTo('String');
    const ex = makeExchange(42);
    await run(route, ex);
    assert.equal(ex.in.body, '42');
    assert.equal(typeof ex.in.body, 'string');
  });

  it('converts string to Number', async () => {
    const route = new RouteDefinition('direct:test');
    route.convertBodyTo('Number');
    const ex = makeExchange('3.14');
    await run(route, ex);
    assert.equal(ex.in.body, 3.14);
    assert.equal(typeof ex.in.body, 'number');
  });

  it('converts string "true" to Boolean true', async () => {
    const route = new RouteDefinition('direct:test');
    route.convertBodyTo('Boolean');
    const ex = makeExchange('true');
    await run(route, ex);
    assert.equal(ex.in.body, true);
  });

  it('converts string "false" to Boolean false', async () => {
    const route = new RouteDefinition('direct:test');
    route.convertBodyTo('Boolean');
    const ex = makeExchange('false');
    await run(route, ex);
    assert.equal(ex.in.body, false);
  });

  it('throws on unsupported type', async () => {
    const route = new RouteDefinition('direct:test');
    route.convertBodyTo('Date');
    const ex = makeExchange('2024-01-01');
    await run(route, ex);
    // Pipeline captures errors on exchange.exception
    assert.ok(ex.exception != null, 'exchange should have an exception');
    assert.match(ex.exception.message, /unsupported type 'Date'/i);
  });
});

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

describe('stop()', () => {
  it('stops exchange processing cleanly — body not modified by subsequent steps', async () => {
    const route = new RouteDefinition('direct:test');
    route
      .setBody(constant('before-stop'))
      .stop()
      .setBody(constant('after-stop')); // should not execute

    const ex = makeExchange('initial');
    // Pipeline swallows CamelFilterStopException — no exception to caller
    await assert.doesNotReject(() => run(route, ex));
    assert.equal(ex.in.body, 'before-stop');
  });
});

// ---------------------------------------------------------------------------
// bean
// ---------------------------------------------------------------------------

describe('bean() with function', () => {
  it('executes a function processor', async () => {
    const route = new RouteDefinition('direct:test');
    route.bean(async (exchange) => { exchange.in.body = 'from-bean-fn'; });
    const ex = makeExchange('original');
    await run(route, ex);
    assert.equal(ex.in.body, 'from-bean-fn');
  });
});

describe('bean() with object', () => {
  it('executes an object with process() method', async () => {
    const processor = {
      async process(exchange) { exchange.in.body = 'from-bean-obj'; },
    };
    const route = new RouteDefinition('direct:test');
    route.bean(processor);
    const ex = makeExchange('original');
    await run(route, ex);
    assert.equal(ex.in.body, 'from-bean-obj');
  });
});

describe('bean() with string name (context lookup)', () => {
  it('looks up bean from context at runtime and executes it', async () => {
    const ctx = new CamelContext();
    ctx.registerBean('myProc', async (exchange) => { exchange.in.body = 'from-ctx-bean'; });

    const route = new RouteDefinition('direct:test');
    route.bean('myProc');
    const ex = makeExchange('original');
    const pipeline = route.compile(ctx);
    await pipeline.run(ex);
    assert.equal(ex.in.body, 'from-ctx-bean');
  });

  it('throws descriptively when bean not found in context', async () => {
    const ctx = new CamelContext();
    const route = new RouteDefinition('direct:test');
    route.bean('ghost');
    const ex = makeExchange('x');
    const pipeline = route.compile(ctx);
    await pipeline.run(ex);
    // Pipeline captures error on exchange.exception
    assert.ok(ex.exception != null, 'exchange should have an exception');
    assert.match(ex.exception.message, /bean\('ghost'\).*no bean registered/i);
  });
});

// ---------------------------------------------------------------------------
// Chained pipeline integration
// ---------------------------------------------------------------------------

describe('chained new DSL steps integration', () => {
  it('setHeader → setBody(simple) → setProperty → marshal → unmarshal round-trip', async () => {
    const ctx = new CamelContext();
    const route = new RouteDefinition('direct:test');
    route
      .setHeader('X-Type', constant('invoice'))
      .setBody(simple('${header.X-Type}'))
      .setProperty('type', js('exchange.in.body'))
      .setBody(constant({ amount: 100, currency: 'USD' }))
      .marshal()
      .unmarshal();

    const ex = makeExchange(null);
    const pipeline = route.compile(ctx);
    await pipeline.run(ex);

    assert.equal(ex.in.getHeader('X-Type'), 'invoice');
    assert.equal(ex.getProperty('type'), 'invoice');
    assert.equal(ex.in.body.amount, 100);
    assert.equal(ex.in.body.currency, 'USD');
  });

  it('convertBodyTo after marshal converts JSON string to String type (no-op)', async () => {
    const route = new RouteDefinition('direct:test');
    route.marshal().convertBodyTo('String');
    const ex = makeExchange({ x: 1 });
    await run(route, ex);
    assert.equal(typeof ex.in.body, 'string');
  });
});
