#!/usr/bin/env node

/**
 * camel-lite CLI
 *
 * Usage:
 *   camel-lite -r <route-file|->  [-i <input|->]  [-d]  [-l text|json]
 *                                 [--verbose]  [--debug]
 *                                 [-p <uri>]  [--exchange-pattern <i|InOnly|io|InOut>]
 *                                 [-c <uri>]
 *
 * Options:
 *   -r, --routes <file|->                     Route definition file (.yaml/.yml/.json) or - for stdin
 *   -i, --input  <body|->                     Message body to inject, or - to read from stdin
 *   -d, --daemon                              Keep context alive until SIGINT/SIGTERM (default: false)
 *   -l, --log-mode <text|json>                Log output format: text (default) or json
 *       --verbose                             Enable info-level logging (default: logging suppressed)
 *       --debug                               Enable debug-level logging (takes precedence over --verbose)
 *   -p, --producer-uri <uri>                  Override producer URI (requires -i; default: first route from URI)
 *       --exchange-pattern <i|InOnly|io|InOut> Exchange pattern: InOnly (fire-and-forget) or InOut (request-reply)
 *   -c, --consumer-uri <uri>                  Poll consumer URI; implies daemon mode; mutually exclusive with -i and -p
 *   -v, --version                             Print version
 *   -h, --help                                Print this help
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
 *   camel-lite --verbose -r route.yaml  # info-level logging
 *   camel-lite --debug  -r route.yaml   # debug-level logging
 *   camel-lite -r route.yaml -i 'hello' -p direct:ep
 *   camel-lite -r route.yaml -i 'hello' --exchange-pattern InOut
 *   camel-lite -r route.yaml -c timer:tick?period=1000  # poll consumer daemon
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
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
  .option('--verbose', 'Enable info-level framework logging (default: suppressed)', false)
  .option('--debug', 'Enable debug-level framework logging (overrides --verbose)', false)
  .option('-p, --producer-uri <uri>', 'Override producer URI (requires -i; default: first route from URI)')
  .option('--exchange-pattern <i|InOnly|io|InOut>', 'Exchange pattern: InOnly (fire-and-forget) or InOut (request-reply)', 'InOnly')
  .option('-c, --consumer-uri <uri>', 'Poll consumer URI; implies daemon mode; mutually exclusive with -i and -p')
  .addHelpText('after', `
Examples:
  $ camel-lite -r route.yaml
  $ camel-lite -r route.yaml -i '{"name":"world"}'
  $ camel-lite -r route.yaml -i -
  $ cat route.yaml | camel-lite -r - -i '{"name":"world"}'
  $ camel-lite -r route.yaml -d
  $ camel-lite -l json -r route.yaml
  $ camel-lite --verbose -r route.yaml
  $ camel-lite --debug  -r route.yaml
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

// -c is mutually exclusive with -i and -p (check before -p requires -i)
if (opts.consumerUri && opts.input !== undefined) {
  fatal('-c / --consumer-uri is mutually exclusive with -i / --input');
}
if (opts.consumerUri && opts.producerUri) {
  fatal('-c / --consumer-uri is mutually exclusive with -p / --producer-uri');
}

// -p requires -i
if (opts.producerUri && opts.input === undefined) {
  fatal('-p / --producer-uri requires -i / --input');
}

// --exchange-pattern normalization and validation
const rawPattern = (opts.exchangePattern ?? 'InOnly').toLowerCase();
const exchangePattern = (rawPattern === 'i' || rawPattern === 'inonly') ? 'InOnly'
                      : (rawPattern === 'io' || rawPattern === 'inout') ? 'InOut'
                      : null;
if (!exchangePattern) {
  fatal(`--exchange-pattern must be 'InOnly', 'i', 'InOut', or 'io', got: '${opts.exchangePattern}'`);
}

// ---------------------------------------------------------------------------
// Compute log level from flags
// --debug takes precedence over --verbose; default is 'off'
// ---------------------------------------------------------------------------

const logLevel = opts.debug ? 'debug' : (opts.verbose ? 'info' : 'off');

// ---------------------------------------------------------------------------
// Boot CDI layer FIRST — before any other dynamic imports
// All config/boot imports are static since they must be available before CDI modules load
// ---------------------------------------------------------------------------

const { Boot } = await import('@alt-javascript/boot');
const { EphemeralConfig, PropertySourceChain, ProfileConfigLoader } = await import('@alt-javascript/config');

// Build the logging+banner overlay (highest priority)
// EphemeralConfig direct key lookup: 'logging.level./' is found via object['logging.level./']
const loggingOverlay = new EphemeralConfig({
  'logging.level./': logLevel,
  'logging.format': logMode === 'json' ? 'json' : 'text',
  boot: { 'banner-mode': 'off' },
});

// Load user config from ~/.camel-lite (synchronous — no await needed)
const userConfig = ProfileConfigLoader.load({
  basePath: join(homedir(), '.camel-lite'),
});

// Compose: overlay wins over user config (index 0 = highest priority)
const chainedConfig = new PropertySourceChain([loggingOverlay, userConfig]);

// Boot the framework — must happen before any CDI/starter dynamic imports
await Boot.boot({ config: chainedConfig });

// ---------------------------------------------------------------------------
// Main async execution — import camel-lite modules AFTER Boot.boot()
// ---------------------------------------------------------------------------

(async () => {
  // Deferred imports — must come after Boot.boot() so LoggerFactory is configured
  const { RouteLoader, ProducerTemplate } = await import('@alt-javascript/camel-lite-core');
  const { CdiCamelRuntime } = await import('../src/index.js');

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

  // 3. Build context and start — pass chainedConfig so CdiCamelRuntime forwards it to the starter
  const runtime = new CdiCamelRuntime(routeBuilder, chainedConfig);
  const ctx = await runtime.createContext();

  // Wire polling URIs before start so CamelContext wraps them with PollingConsumerAdapter
  if (opts.consumerUri) {
    ctx.pollingUris = new Set([opts.consumerUri]);
  }

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
    const targetUri = opts.producerUri ?? fromUri;
    if (exchangePattern === 'InOut') {
      // requestBody returns the reply body value directly (not an Exchange)
      const replyBody = await pt.requestBody(targetUri, inputBody);
      if (replyBody !== null && replyBody !== undefined) {
        const out = typeof replyBody === 'string' ? replyBody : JSON.stringify(replyBody);
        process.stdout.write(out + '\n');
      }
    } else {
      // InOnly: sendBody returns an Exchange
      const exchange = await pt.sendBody(targetUri, inputBody);
      if (exchange.isFailed()) {
        process.stderr.write(`camel-lite: route error: ${exchange.exception.message}\n`);
        await runtime.stop();
        process.exit(1);
      }
      const resultBody = exchange.in.body;
      if (resultBody !== null && resultBody !== undefined) {
        const out = typeof resultBody === 'string' ? resultBody : JSON.stringify(resultBody);
        process.stdout.write(out + '\n');
      }
    }
  }

  // 6. Consumer daemon loop (-c flag)
  if (opts.consumerUri) {
    const { ConsumerTemplate } = await import('@alt-javascript/camel-lite-core');
    const ct = new ConsumerTemplate(ctx);
    let stopping = false;
    const shutdown = async (signal) => {
      stopping = true;
      process.stderr.write(`\ncamel-lite: received ${signal}, stopping...\n`);
      await runtime.stop();
      process.exit(0);
    };
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    while (!stopping) {
      const body = await ct.receiveBody(opts.consumerUri, 5000);
      if (body !== null && body !== undefined) {
        const out = typeof body === 'string' ? body : JSON.stringify(body);
        process.stdout.write(out + '\n');
      }
    }
    return; // skip the normal shutdown below
  }

  // 7. Daemon mode or shutdown
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
