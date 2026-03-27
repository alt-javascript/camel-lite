#!/usr/bin/env node

/**
 * camel-lite CLI
 *
 * Usage:
 *   camel-lite -r <route-file|->  [-i <input|->]  [-d]  [-l text|json]
 *
 * Options:
 *   -r, --routes <file|->      Route definition file (.yaml/.yml/.json) or - for stdin
 *   -i, --input  <body|->      Message body to inject, or - to read from stdin
 *   -d, --daemon               Keep context alive until SIGINT/SIGTERM (default: false)
 *   -l, --log-mode <text|json> Log output format: text (default) or json
 *   -v, --version              Print version
 *   -h, --help                 Print this help
 *
 * Exactly one of -r or -i may use stdin (-).
 *
 * Examples:
 *   camel-lite -r route.yaml
 *   camel-lite -r route.yaml -i '{"name":"world"}'
 *   camel-lite -r route.yaml -i -       # read body from stdin
 *   cat route.yaml | camel-lite -r - -i '{"name":"world"}'
 *   camel-lite -r route.yaml -d         # daemon mode — Ctrl-C to stop
 *   camel-lite -l json -r route.yaml    # JSON log output
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { program } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fatal(msg) {
  process.stderr.write(`camel-lite: error: ${msg}\n`);
  process.exit(1);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  }
  return chunks.join('');
}

/**
 * Configure @alt-javascript/logger for the requested output mode.
 * Must be called before any camel-lite module imports to take effect,
 * since loggers are constructed with their formatter at getLogger() call time.
 * @param {'text'|'json'} mode
 */
async function configureLogging(mode) {
  const { Boot } = await import('@alt-javascript/boot');
  const { EphemeralConfig } = await import('@alt-javascript/config');
  Boot.boot({
    printBanner: false,
    config: new EphemeralConfig({
      logging: { format: mode === 'json' ? 'json' : 'text' }
    })
  });
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

program
  .name('camel-lite')
  .version(pkg.version, '-v, --version')
  .description('Load a camel-lite route definition and optionally inject a message')
  .option('-r, --routes <file|->', 'Route definition file (.yaml/.yml/.json) or - for stdin')
  .option('-i, --input <body|->', 'Message body to inject, or - to read from stdin')
  .option('-d, --daemon', 'Keep context alive until SIGINT/SIGTERM', false)
  .option('-l, --log-mode <text|json>', 'Log output format: text (default) or json', 'text')
  .addHelpText('after', `
Examples:
  $ camel-lite -r route.yaml
  $ camel-lite -r route.yaml -i '{"name":"world"}'
  $ camel-lite -r route.yaml -i -
  $ cat route.yaml | camel-lite -r - -i '{"name":"world"}'
  $ camel-lite -r route.yaml -d
  $ camel-lite -l json -r route.yaml
`);

program.parse(process.argv);
const opts = program.opts();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

if (!opts.routes) {
  fatal('-r / --routes is required');
}

if (opts.routes === '-' && opts.input === '-') {
  fatal('-r - and -i - are mutually exclusive: only one argument can read from stdin');
}

const logMode = (opts.logMode ?? 'text').toLowerCase();
if (logMode !== 'text' && logMode !== 'json') {
  fatal(`-l / --log-mode must be 'text' or 'json', got: '${logMode}'`);
}

// ---------------------------------------------------------------------------
// Configure logging FIRST — before any camel-lite module imports
// ---------------------------------------------------------------------------

await configureLogging(logMode);

// ---------------------------------------------------------------------------
// Main async execution — import camel-lite modules AFTER logging is configured
// ---------------------------------------------------------------------------

(async () => {
  // Deferred imports so the log formatter is set before any getLogger() calls
  const { RouteLoader, ProducerTemplate } = await import('camel-lite-core');
  const { CamelRuntime } = await import('../src/index.js');

  let routeBuilder;
  let inputBody;

  // 1. Load route definition
  if (opts.routes === '-') {
    process.stderr.write('camel-lite: reading route definition from stdin...\n');
    routeBuilder = await RouteLoader.loadStream(process.stdin);
  } else {
    routeBuilder = await RouteLoader.loadFile(opts.routes);
  }

  // 2. Read input body if -i - (stdin, only reachable when -r was not -)
  if (opts.input === '-') {
    process.stderr.write('camel-lite: reading input body from stdin...\n');
    inputBody = await readStdin();
  } else if (opts.input !== undefined) {
    inputBody = opts.input;
  }

  // 3. Build context and start
  const runtime = new CamelRuntime();
  const ctx = await runtime.createContext(routeBuilder);
  await runtime.start();

  // 4. Extract the from URI of the first route (used for ProducerTemplate injection)
  const routes = routeBuilder.getRoutes();
  if (routes.length === 0) {
    await runtime.stop();
    fatal('No routes found in the route definition');
  }
  const fromUri = routes[0].fromUri;

  // 5. Inject input if provided
  if (inputBody !== undefined) {
    const pt = new ProducerTemplate(ctx);
    const exchange = await pt.sendBody(fromUri, inputBody);
    if (exchange.isFailed()) {
      process.stderr.write(`camel-lite: route error: ${exchange.exception.message}\n`);
      await runtime.stop();
      process.exit(1);
    }
    // Print result body to stdout
    const resultBody = exchange.in.body;
    if (resultBody !== null && resultBody !== undefined) {
      const out = typeof resultBody === 'string' ? resultBody : JSON.stringify(resultBody);
      process.stdout.write(out + '\n');
    }
  }

  // 6. Daemon mode or shutdown
  if (opts.daemon) {
    process.stderr.write(`camel-lite: context running (daemon mode) — press Ctrl-C to stop\n`);

    const shutdown = async (signal) => {
      process.stderr.write(`\ncamel-lite: received ${signal}, stopping...\n`);
      await runtime.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } else {
    await runtime.stop();
    process.exit(0);
  }
})().catch(err => {
  process.stderr.write(`camel-lite: fatal: ${err.message}\n`);
  process.exit(1);
});
