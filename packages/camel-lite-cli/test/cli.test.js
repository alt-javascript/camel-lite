import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { CamelRuntime } from '../src/index.js';
import { RouteLoader, ProducerTemplate } from '@alt-javascript/camel-lite-core';
import { ProfileConfigLoader } from '@alt-javascript/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'log-route.yaml');

// ---------------------------------------------------------------------------
// CamelRuntime: component registration
// ---------------------------------------------------------------------------

describe('CamelRuntime: createContext registers all components', async () => {
  it('does not throw when registering all components', async () => {
    const runtime = new CamelRuntime();
    const builder = await RouteLoader.loadFile(FIXTURE);
    const ctx = await runtime.createContext(builder);
    // Check core schemes are present
    assert.ok(ctx.getComponent('direct'), 'direct component registered');
    assert.ok(ctx.getComponent('seda'),   'seda component registered');
    assert.ok(ctx.getComponent('log'),    'log component registered');
    assert.ok(ctx.getComponent('file'),   'file component registered');
    assert.ok(ctx.getComponent('http'),   'http component registered');
    assert.ok(ctx.getComponent('ftp'),    'ftp component registered');
    assert.ok(ctx.getComponent('sql'),    'sql component registered');
    assert.ok(ctx.getComponent('nosql'),  'nosql component registered');
    // amqp may or may not be registered depending on native dep — just don't throw
  });
});

// ---------------------------------------------------------------------------
// CamelRuntime: lifecycle
// ---------------------------------------------------------------------------

describe('CamelRuntime: start and stop lifecycle', () => {
  it('starts and stops a context loaded from a YAML fixture', async () => {
    const runtime = new CamelRuntime();
    const builder = await RouteLoader.loadFile(FIXTURE);
    await runtime.createContext(builder);
    await assert.doesNotReject(() => runtime.start());
    await assert.doesNotReject(() => runtime.stop());
  });

  it('stop is a no-op before createContext', async () => {
    const runtime = new CamelRuntime();
    await assert.doesNotReject(() => runtime.stop());
  });

  it('start throws if createContext was not called', async () => {
    const runtime = new CamelRuntime();
    await assert.rejects(() => runtime.start(), /call createContext/);
  });
});

// ---------------------------------------------------------------------------
// CamelRuntime: send through log: route
// ---------------------------------------------------------------------------

describe('CamelRuntime: sendBody through a log: route', () => {
  let runtime;

  before(async () => {
    runtime = new CamelRuntime();
    const builder = await RouteLoader.loadFile(FIXTURE);
    await runtime.createContext(builder);
    await runtime.start();
  });

  after(async () => {
    await runtime.stop();
  });

  it('ProducerTemplate.sendBody does not throw and exchange has no exception', async () => {
    const pt = new ProducerTemplate(runtime.context);
    const exchange = await pt.sendBody('direct:cli-test', 'hello world');
    assert.equal(exchange.exception, null);
  });
});

// ---------------------------------------------------------------------------
// Arg validation logic (extracted, no process.exit)
// ---------------------------------------------------------------------------

describe('CLI arg validation', () => {
  function validateArgs(routes, input, logMode = 'text', producerUri = undefined, exchangePattern = 'InOnly', consumerUri = undefined) {
    if (!routes) return { error: '-r / --routes is required' };
    if (routes === '-' && input === '-') {
      return { error: '-r - and -i - are mutually exclusive: only one argument can read from stdin' };
    }
    const mode = (logMode ?? 'text').toLowerCase();
    if (mode !== 'text' && mode !== 'json') {
      return { error: `-l / --log-mode must be 'text' or 'json', got: '${logMode}'` };
    }
    if (consumerUri && input !== undefined) {
      return { error: '-c / --consumer-uri is mutually exclusive with -i / --input' };
    }
    if (consumerUri && producerUri) {
      return { error: '-c / --consumer-uri is mutually exclusive with -p / --producer-uri' };
    }
    if (producerUri && input === undefined) {
      return { error: '-p / --producer-uri requires -i / --input' };
    }
    const rawPat = (exchangePattern ?? 'InOnly').toLowerCase();
    const validPatterns = ['i', 'inonly', 'io', 'inout'];
    if (!validPatterns.includes(rawPat)) {
      return { error: `--exchange-pattern must be 'InOnly', 'i', 'InOut', or 'io', got: '${exchangePattern}'` };
    }
    return { ok: true };
  }

  it('missing -r produces error', () => {
    const result = validateArgs(undefined, undefined);
    assert.ok(result.error, 'expected error');
    assert.match(result.error, /--routes is required/);
  });

  it('-r - and -i - produces mutual exclusion error', () => {
    const result = validateArgs('-', '-');
    assert.ok(result.error, 'expected error');
    assert.match(result.error, /mutually exclusive/);
  });

  it('valid -r <file> passes', () => {
    const result = validateArgs('route.yaml', undefined);
    assert.ok(result.ok);
  });

  it('valid -r - with explicit -i <body> passes', () => {
    const result = validateArgs('-', '{"name":"world"}');
    assert.ok(result.ok);
  });

  it('valid -r <file> with -i - passes', () => {
    const result = validateArgs('route.yaml', '-');
    assert.ok(result.ok);
  });

  it('-l text is valid', () => {
    assert.ok(validateArgs('route.yaml', undefined, 'text').ok);
  });

  it('-l json is valid', () => {
    assert.ok(validateArgs('route.yaml', undefined, 'json').ok);
  });

  it('-l TEXT is valid (case-insensitive)', () => {
    assert.ok(validateArgs('route.yaml', undefined, 'TEXT').ok);
  });

  it('-l invalid produces error', () => {
    const result = validateArgs('route.yaml', undefined, 'xml');
    assert.ok(result.error);
    assert.match(result.error, /must be 'text' or 'json'/);
  });

  it('-p without -i produces error', () => {
    const result = validateArgs('r.yaml', undefined, 'text', 'direct:ep');
    assert.ok(result.error, 'expected error');
    assert.match(result.error, /--producer-uri requires -i/);
  });

  it('-p with -i passes', () => {
    const result = validateArgs('r.yaml', 'body', 'text', 'direct:ep');
    assert.ok(result.ok);
  });

  it('--exchange-pattern InOnly passes', () => {
    const result = validateArgs('r.yaml', undefined, 'text', undefined, 'InOnly');
    assert.ok(result.ok);
  });

  it('--exchange-pattern InOut passes', () => {
    const result = validateArgs('r.yaml', undefined, 'text', undefined, 'InOut');
    assert.ok(result.ok);
  });

  it('--exchange-pattern short forms i and io pass', () => {
    assert.ok(validateArgs('r.yaml', undefined, 'text', undefined, 'i').ok);
    assert.ok(validateArgs('r.yaml', undefined, 'text', undefined, 'io').ok);
  });

  it('--exchange-pattern invalid produces error', () => {
    const result = validateArgs('r.yaml', undefined, 'text', undefined, 'xml');
    assert.ok(result.error, 'expected error');
    assert.match(result.error, /must be 'InOnly'/);
  });

  it('-c with -i produces error', () => {
    const result = validateArgs('r.yaml', 'hello', 'text', undefined, 'InOnly', 'timer:tick');
    assert.ok(result.error, 'expected error');
    assert.match(result.error, /mutually exclusive with -i/);
  });

  it('-c with -p produces error', () => {
    const result = validateArgs('r.yaml', undefined, 'text', 'direct:ep', 'InOnly', 'timer:tick');
    assert.ok(result.error, 'expected error');
    assert.match(result.error, /mutually exclusive with -p/);
  });

  it('-c alone passes', () => {
    const result = validateArgs('r.yaml', undefined, 'text', undefined, 'InOnly', 'timer:tick');
    assert.ok(result.ok);
  });
});

// ---------------------------------------------------------------------------
// RouteLoader.loadStream from CLI package import path
// ---------------------------------------------------------------------------

describe('RouteLoader.loadStream: YAML from stream (CLI import path)', () => {
  it('loads a YAML route from a Readable stream', async () => {
    const yaml = `
route:
  from:
    uri: direct:stream-cli-test
    steps:
      - log: "stream loaded"
`;
    const stream = Readable.from([yaml]);
    const builder = await RouteLoader.loadStream(stream);
    const routes = builder.getRoutes();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].fromUri, 'direct:stream-cli-test');
  });

  it('loads a JSON route from a Readable stream', async () => {
    const json = JSON.stringify({
      route: {
        from: {
          uri: 'direct:stream-json-cli',
          steps: [{ log: 'json loaded' }]
        }
      }
    });
    const stream = Readable.from([json]);
    const builder = await RouteLoader.loadStream(stream);
    const routes = builder.getRoutes();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].fromUri, 'direct:stream-json-cli');
  });
});

// ---------------------------------------------------------------------------
// ProfileConfigLoader: ~/.camel-lite config discovery
// ---------------------------------------------------------------------------

describe('ProfileConfigLoader: config discovery from basePath', () => {
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'camel-lite-config-test-'));
    writeFileSync(
      join(tempDir, 'application.yaml'),
      'camel:\n  app:\n    name: test-app\n  route:\n    timeout: 5000\n',
    );
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads application.yaml from the given basePath', () => {
    const chain = ProfileConfigLoader.load({ basePath: tempDir });
    assert.ok(chain.has('camel.app.name'), 'camel.app.name should be present');
    assert.equal(chain.get('camel.app.name'), 'test-app');
  });

  it('resolves nested numeric config values', () => {
    const chain = ProfileConfigLoader.load({ basePath: tempDir });
    assert.ok(chain.has('camel.route.timeout'), 'camel.route.timeout should be present');
    assert.equal(chain.get('camel.route.timeout'), 5000);
  });

  it('returns defaultValue for missing keys', () => {
    const chain = ProfileConfigLoader.load({ basePath: tempDir });
    assert.equal(chain.get('does.not.exist', 'fallback'), 'fallback');
  });

  it('overrides from options.overrides take priority over file values', () => {
    const chain = ProfileConfigLoader.load({
      basePath: tempDir,
      overrides: { 'camel.app.name': 'overridden-app' },
    });
    assert.equal(chain.get('camel.app.name'), 'overridden-app');
  });
});
