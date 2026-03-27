import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { EphemeralConfig } from '@alt-javascript/config';
import { camelLiteStarter, camelLiteAutoConfiguration, CamelLiteContext } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const contexts = []; // track for cleanup

async function boot(config = {}) {
  const cfg = new EphemeralConfig(config);
  const { applicationContext } = await camelLiteStarter({ config: cfg });
  contexts.push(applicationContext);
  return applicationContext;
}

after(async () => {
  for (const ctx of contexts) {
    try {
      const c = ctx.get('camelLiteContext');
      await c.camelContext?.stop();
    } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// 1. Auto-configuration shape
// ---------------------------------------------------------------------------

describe('camelLiteAutoConfiguration: shape', () => {
  it('returns an array of CDI component definitions', async () => {
    const defs = await camelLiteAutoConfiguration();
    assert.ok(Array.isArray(defs));
    const names = defs.map(d => d.name);
    assert.ok(names.includes('camelLiteContext'));
    assert.ok(names.includes('routeRegistry'));
    assert.ok(names.includes('camelProducerTemplate'));
    assert.ok(names.includes('camelConsumerTemplate'));
    // bundled schemes
    for (const scheme of ['direct','seda','log','file','http','ftp','timer','cron']) {
      assert.ok(names.includes(`camelComponent.${scheme}`), `missing camelComponent.${scheme}`);
    }
  });

  it('camelLiteContext dependsOn routeRegistry', async () => {
    const defs = await camelLiteAutoConfiguration();
    const ctxDef = defs.find(d => d.name === 'camelLiteContext');
    const deps = Array.isArray(ctxDef.dependsOn)
      ? ctxDef.dependsOn
      : [ctxDef.dependsOn];
    assert.ok(deps.includes('routeRegistry'));
  });
});

// ---------------------------------------------------------------------------
// 2. ApplicationContext boots and CamelLiteContext is ready
// ---------------------------------------------------------------------------

describe('camelLiteStarter: boot lifecycle', () => {
  it('camelLiteContext bean is present in ApplicationContext', async () => {
    const appCtx = await boot();
    const ctx = appCtx.get('camelLiteContext');
    assert.ok(ctx instanceof CamelLiteContext);
  });

  it('ready() resolves without throwing', async () => {
    const appCtx = await boot();
    const ctx = appCtx.get('camelLiteContext');
    await assert.doesNotReject(() => ctx.ready());
  });

  it('CamelContext is started after ready()', async () => {
    const appCtx = await boot();
    const ctx = appCtx.get('camelLiteContext');
    await ctx.ready();
    assert.equal(ctx.camelContext.started, true);
  });
});

// ---------------------------------------------------------------------------
// 3. ProducerTemplate CDI bean
// ---------------------------------------------------------------------------

describe('camelProducerTemplate: sendBody through direct: route', () => {
  it('sends message through a route and returns exchange with no exception', async () => {
    // Boot with a config route using a direct: endpoint
    const cfg = new EphemeralConfig({
      boot: {
        'camel-lite': {
          routes: [{
            definition: {
              route: {
                from: { uri: 'direct:hello', steps: [{ setBody: { constant: 'response' } }] }
              }
            }
          }]
        }
      }
    });

    const { applicationContext } = await camelLiteStarter({ config: cfg });
    contexts.push(applicationContext);
    const clCtx = applicationContext.get('camelLiteContext');
    await clCtx.ready();

    const pt = applicationContext.get('camelProducerTemplate');
    const exchange = await pt.sendBody('direct:hello', 'input');
    assert.equal(exchange.exception, null);
    assert.equal(exchange.in.body, 'response');
  });
});

// ---------------------------------------------------------------------------
// 4. CDI RouteBuilder bean discovery
// ---------------------------------------------------------------------------

describe('RouteRegistry: CDI RouteBuilder bean discovery', () => {
  it('discovers a CDI bean with configure(ctx) and activates its routes', async () => {
    const { ApplicationContext } = await import('@alt-javascript/cdi');
    const { EphemeralConfig } = await import('@alt-javascript/config');
    const { camelLiteAutoConfiguration } = await import('../index.js');
    const { RouteBuilder } = await import('camel-lite-core');

    const received = [];

    // CamelContext.addRoutes(builder) calls builder.configure(this) then iterates
    // builder.getRoutes(). A RouteBuilder subclass that calls this.from() in
    // configure() is the standard CDI RouteBuilder pattern.
    class TestRouteBuilder extends RouteBuilder {
      configure(camelCtx) {
        this.from('direct:cdi-discovered').process(ex => {
          received.push(ex.in.body);
        });
      }
    }

    const autoConfig = await camelLiteAutoConfiguration();
    const appCtx = new ApplicationContext({
      config: new EphemeralConfig({}),
      contexts: [
        [{ name: 'testRouteBuilder', Reference: TestRouteBuilder, scope: 'singleton' }],
        autoConfig,
      ],
    });
    await appCtx.start();
    contexts.push(appCtx);

    const clCtx = appCtx.get('camelLiteContext');
    await clCtx.ready();

    const pt = appCtx.get('camelProducerTemplate');
    await pt.sendBody('direct:cdi-discovered', 'discovery-test');

    assert.deepEqual(received, ['discovery-test']);
  });
});

// ---------------------------------------------------------------------------
// 5. Config-driven route definition objects
// ---------------------------------------------------------------------------

describe('RouteRegistry: config route objects via RouteLoader.loadObject', () => {
  it('loads route from boot.camel-lite.routes[0].definition object', async () => {
    const fired = [];
    const cfg = new EphemeralConfig({
      boot: {
        'camel-lite': {
          routes: [{
            definition: {
              route: {
                from: {
                  uri: 'direct:config-route',
                  steps: [{ setBody: { constant: 'from-config' } }]
                }
              }
            }
          }]
        }
      }
    });

    const { applicationContext } = await camelLiteStarter({ config: cfg });
    contexts.push(applicationContext);
    const clCtx = applicationContext.get('camelLiteContext');
    await clCtx.ready();

    const pt = applicationContext.get('camelProducerTemplate');
    const exchange = await pt.sendBody('direct:config-route', 'input');
    assert.equal(exchange.in.body, 'from-config');
  });

  it('loads multiple config routes', async () => {
    const cfg = new EphemeralConfig({
      boot: {
        'camel-lite': {
          routes: [
            { definition: { route: { from: { uri: 'direct:multi-a', steps: [{ setBody: { constant: 'a' } }] } } } },
            { definition: { route: { from: { uri: 'direct:multi-b', steps: [{ setBody: { constant: 'b' } }] } } } },
          ]
        }
      }
    });

    const { applicationContext } = await camelLiteStarter({ config: cfg });
    contexts.push(applicationContext);
    const clCtx = applicationContext.get('camelLiteContext');
    await clCtx.ready();

    const pt = applicationContext.get('camelProducerTemplate');
    const exA = await pt.sendBody('direct:multi-a', 'x');
    const exB = await pt.sendBody('direct:multi-b', 'x');
    assert.equal(exA.in.body, 'a');
    assert.equal(exB.in.body, 'b');
  });
});

// ---------------------------------------------------------------------------
// 6. Component enable/disable
// ---------------------------------------------------------------------------

describe('Component enable/disable via config', () => {
  it('direct: component registered by default (no config flag)', async () => {
    const appCtx = await boot({});
    const clCtx = appCtx.get('camelLiteContext');
    await clCtx.ready();
    assert.ok(clCtx.camelContext.getComponent('direct'), 'direct component should be registered');
  });

  it('direct: component absent when boot.camel-lite.direct.enabled=false', async () => {
    const cfg = new EphemeralConfig({
      boot: { 'camel-lite': { direct: { enabled: false } } }
    });
    const { applicationContext } = await camelLiteStarter({ config: cfg });
    contexts.push(applicationContext);
    const clCtx = applicationContext.get('camelLiteContext');
    await clCtx.ready();
    assert.equal(clCtx.camelContext.getComponent('direct'), undefined);
  });
});
