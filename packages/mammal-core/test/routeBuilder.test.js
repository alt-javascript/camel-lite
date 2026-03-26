import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RouteBuilder } from '../src/RouteBuilder.js';
import { RouteDefinition } from '../src/RouteDefinition.js';
import { Pipeline } from '../src/Pipeline.js';
import { MammalContext } from '../src/MammalContext.js';
import { Exchange } from '../src/Exchange.js';

describe('RouteBuilder', () => {
  it('from() returns a RouteDefinition with correct fromUri', () => {
    const builder = new RouteBuilder();
    const routeDef = builder.from('direct:start');
    assert.ok(routeDef instanceof RouteDefinition);
    assert.equal(routeDef.fromUri, 'direct:start');
  });

  it('process() and to() are fluent; getRoutes() has 1 route after one from()', () => {
    const builder = new RouteBuilder();
    const fn = async (ex) => { ex.in.body = 'x'; };
    const routeDef = builder.from('direct:start');
    const returned = routeDef.process(fn).to('direct:next');
    assert.strictEqual(returned, routeDef, 'process().to() should return routeDef');
    assert.equal(builder.getRoutes().length, 1);
  });

  it('getRoutes() returns a copy — mutations do not affect internal state', () => {
    const builder = new RouteBuilder();
    builder.from('direct:a');
    const routes = builder.getRoutes();
    routes.push('garbage');
    assert.equal(builder.getRoutes().length, 1);
  });

  it('RouteBuilder subclass: configure() populates routes', () => {
    const fn = async (ex) => { ex.in.body = 'sub'; };
    class MyRoutes extends RouteBuilder {
      configure() {
        this.from('direct:a').process(fn);
      }
    }
    const myRoutes = new MyRoutes();
    myRoutes.configure();
    assert.equal(myRoutes.getRoutes().length, 1);
    assert.equal(myRoutes.getRoutes()[0].fromUri, 'direct:a');
  });

  it('configure() default no-op does not throw', () => {
    const builder = new RouteBuilder();
    assert.doesNotThrow(() => builder.configure({}));
  });
});

describe('RouteDefinition.compile()', () => {
  it('compile() returns a Pipeline instance', () => {
    const routeDef = new RouteDefinition('direct:test');
    routeDef.process(async (ex) => { ex.in.body = 'y'; });
    assert.ok(routeDef.compile() instanceof Pipeline);
  });

  it('compile() skips to() nodes — only process() nodes go into pipeline', async () => {
    let step1Called = false;
    const routeDef = new RouteDefinition('direct:test');
    routeDef
      .process(async (ex) => { step1Called = true; ex.out.body = 'a'; })
      .to('direct:other');

    const pipeline = routeDef.compile();
    const ex = new Exchange();
    await pipeline.run(ex);
    assert.equal(step1Called, true);
    assert.equal(ex.exception, null);
  });
});

describe('MammalContext route registry', () => {
  it('addRoutes() stores route; getRoute() returns a Pipeline', () => {
    const builder = new RouteBuilder();
    builder.from('direct:start').process(async (ex) => { ex.in.body = 'ok'; });
    const context = new MammalContext();
    context.addRoutes(builder);
    const pipeline = context.getRoute('direct:start');
    assert.ok(pipeline instanceof Pipeline);
  });

  it('addRoutes() returns context (fluent)', () => {
    const builder = new RouteBuilder();
    builder.from('direct:x');
    const context = new MammalContext();
    assert.strictEqual(context.addRoutes(builder), context);
  });

  it('getRoute() returns undefined for unknown uri', () => {
    const context = new MammalContext();
    assert.equal(context.getRoute('direct:unknown'), undefined);
  });

  it('addRoutes() calls configure() on builder if defined', () => {
    let configureCalled = false;
    class MyRoutes extends RouteBuilder {
      configure(ctx) {
        configureCalled = true;
        assert.ok(ctx instanceof MammalContext, 'context should be passed to configure');
        this.from('direct:b').process(async (ex) => { ex.in.body = 'b'; });
      }
    }
    const context = new MammalContext();
    context.addRoutes(new MyRoutes());
    assert.equal(configureCalled, true);
    assert.ok(context.getRoute('direct:b') instanceof Pipeline);
  });

  it('addRoutes() with multiple routes registers each', () => {
    const builder = new RouteBuilder();
    builder.from('direct:one').process(async (ex) => { ex.in.body = '1'; });
    builder.from('direct:two').process(async (ex) => { ex.in.body = '2'; });
    const context = new MammalContext();
    context.addRoutes(builder);
    assert.ok(context.getRoute('direct:one') instanceof Pipeline);
    assert.ok(context.getRoute('direct:two') instanceof Pipeline);
  });
});

describe('Integration: 3-step pipeline via addRoutes', () => {
  it('step 1 sets out.body → step 2 sees it in in.body → step 3 same pattern; no exception', async () => {
    let step2InBody;
    let step3InBody;

    const builder = new RouteBuilder();
    builder
      .from('direct:start')
      .process(async (ex) => {
        ex.out.body = 'step1';
      })
      .process(async (ex) => {
        step2InBody = ex.in.body;
        ex.out.body = 'step2';
      })
      .process(async (ex) => {
        step3InBody = ex.in.body;
      });

    const context = new MammalContext();
    context.addRoutes(builder);

    const pipeline = context.getRoute('direct:start');
    assert.ok(pipeline instanceof Pipeline);

    const exchange = new Exchange();
    await pipeline.run(exchange);

    assert.equal(exchange.exception, null, 'no exception should be set');
    assert.equal(step2InBody, 'step1', 'step2 should see promoted in.body from step1');
    assert.equal(step3InBody, 'step2', 'step3 should see promoted in.body from step2');
  });

  it('both fn and object processor forms work in a compiled route', async () => {
    const objProcessor = {
      process(ex) {
        ex.out.body = ex.in.body + '-obj';
      },
    };

    const builder = new RouteBuilder();
    builder
      .from('direct:mixed')
      .process(async (ex) => { ex.out.body = 'fn'; })
      .process(objProcessor);

    const context = new MammalContext();
    context.addRoutes(builder);

    const pipeline = context.getRoute('direct:mixed');
    const exchange = new Exchange();
    await pipeline.run(exchange);

    assert.equal(exchange.exception, null);
    // step1 fn sets out.body='fn' → promoted to in.body='fn'
    // step2 obj reads in.body='fn', sets out.body='fn-obj' → promoted to in.body='fn-obj'
    assert.equal(exchange.in.body, 'fn-obj');
  });
});
