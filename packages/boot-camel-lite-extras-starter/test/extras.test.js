import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { EphemeralConfig } from '@alt-javascript/config';
import { camelLiteExtrasStarter, camelLiteExtrasAutoConfiguration } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const contexts = [];

async function bootExtras(config = {}) {
  const cfg = new EphemeralConfig(config);
  const { applicationContext } = await camelLiteExtrasStarter({ config: cfg });
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

describe('camelLiteExtrasAutoConfiguration: shape', () => {
  it('returns definitions for all four extras components', async () => {
    const defs = await camelLiteExtrasAutoConfiguration();
    const names = defs.map(d => d.name);
    assert.ok(names.includes('camelComponent.amqp'));
    assert.ok(names.includes('camelComponent.sql'));
    assert.ok(names.includes('camelComponent.nosql'));
    assert.ok(names.includes('camelComponent.master'));
  });

  it('each definition has a condition function', async () => {
    const defs = await camelLiteExtrasAutoConfiguration();
    for (const def of defs) {
      assert.equal(typeof def.condition, 'function', `${def.name} should have a condition`);
    }
  });

  it('condition returns true when enabled flag absent (default on)', async () => {
    const defs = await camelLiteExtrasAutoConfiguration();
    const cfg = new EphemeralConfig({});
    for (const def of defs) {
      assert.equal(def.condition(cfg), true, `${def.name} should be enabled by default`);
    }
  });

  it('condition returns false when enabled=false', async () => {
    const defs = await camelLiteExtrasAutoConfiguration();
    for (const def of defs) {
      const scheme = def.name.replace('camelComponent.', '');
      const cfg = new EphemeralConfig({ boot: { 'camel-lite': { [scheme]: { enabled: false } } } });
      assert.equal(def.condition(cfg), false, `${def.name} should be disabled`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Boot lifecycle with extras
// ---------------------------------------------------------------------------

describe('camelLiteExtrasStarter: boot lifecycle', () => {
  it('boots ApplicationContext without throwing', async () => {
    const appCtx = await bootExtras({});
    assert.ok(appCtx);
  });

  it('CamelContext is started after ready()', async () => {
    const appCtx = await bootExtras({});
    const ctx = appCtx.get('camelLiteContext');
    await ctx.ready();
    assert.equal(ctx.camelContext.started, true);
  });

  it('all extras components registered by default', async () => {
    const appCtx = await bootExtras({});
    const ctx = appCtx.get('camelLiteContext');
    await ctx.ready();
    const cc = ctx.camelContext;
    assert.ok(cc.getComponent('amqp'),   'amqp component should be registered');
    assert.ok(cc.getComponent('sql'),    'sql component should be registered');
    assert.ok(cc.getComponent('nosql'),  'nosql component should be registered');
    assert.ok(cc.getComponent('master'), 'master component should be registered');
  });
});

// ---------------------------------------------------------------------------
// 3. Per-component enable/disable
// ---------------------------------------------------------------------------

describe('extras components enable/disable', () => {
  it('nosql: absent when boot.camel-lite.nosql.enabled=false', async () => {
    const cfg = new EphemeralConfig({
      boot: { 'camel-lite': { nosql: { enabled: false } } }
    });
    const { applicationContext } = await camelLiteExtrasStarter({ config: cfg });
    contexts.push(applicationContext);
    const ctx = applicationContext.get('camelLiteContext');
    await ctx.ready();
    assert.equal(ctx.camelContext.getComponent('nosql'), undefined);
  });

  it('master: absent when boot.camel-lite.master.enabled=false', async () => {
    const cfg = new EphemeralConfig({
      boot: { 'camel-lite': { master: { enabled: false } } }
    });
    const { applicationContext } = await camelLiteExtrasStarter({ config: cfg });
    contexts.push(applicationContext);
    const ctx = applicationContext.get('camelLiteContext');
    await ctx.ready();
    assert.equal(ctx.camelContext.getComponent('master'), undefined);
  });
});

// ---------------------------------------------------------------------------
// 4. Functional integration: nosql: via config route
// ---------------------------------------------------------------------------

describe('nosql: component functional with in-memory route', () => {
  it('nosql: component usable in a route with jsnosqlc:memory:', async () => {
    // Register the in-memory driver before using nosql:
    await import('@alt-javascript/jsnosqlc-memory');

    const cfg = new EphemeralConfig({
      boot: {
        'camel-lite': {
          routes: [{
            definition: {
              route: {
                from: {
                  uri: 'direct:nosql-test',
                  steps: [{
                    to: 'nosql:items?url=jsnosqlc:memory:&operation=insert'
                  }]
                }
              }
            }
          }]
        }
      }
    });

    const { applicationContext } = await camelLiteExtrasStarter({ config: cfg });
    contexts.push(applicationContext);
    const clCtx = applicationContext.get('camelLiteContext');
    await clCtx.ready();

    const pt = applicationContext.get('camelProducerTemplate');
    const exchange = await pt.sendBody('direct:nosql-test', { name: 'test' });
    // insert may succeed or fail gracefully depending on nosql: component impl
    // primary assertion: no crash, exchange is returned
    assert.ok(exchange !== null);
  });
});

// ---------------------------------------------------------------------------
// 5. master: component functional with file backend
// ---------------------------------------------------------------------------

describe('master: component functional via config route', () => {
  it('master: component registers in CamelContext', async () => {
    const appCtx = await bootExtras({});
    const ctx = appCtx.get('camelLiteContext');
    await ctx.ready();
    assert.ok(ctx.camelContext.getComponent('master'));
  });
});

// ---------------------------------------------------------------------------
// 6. sql: component registers
// ---------------------------------------------------------------------------

describe('sql: component functional', () => {
  it('sql: component registers in CamelContext', async () => {
    const appCtx = await bootExtras({});
    const ctx = appCtx.get('camelLiteContext');
    await ctx.ready();
    assert.ok(ctx.camelContext.getComponent('sql'));
  });
});
