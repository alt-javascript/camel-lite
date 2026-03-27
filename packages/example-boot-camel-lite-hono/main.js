/**
 * example-boot-camel-lite-hono — entry point
 *
 * Boots a unified ApplicationContext containing:
 *   - Hono web server (honoStarter)
 *   - camel-lite extras (camelLiteExtrasStarter components + core)
 *   - MessageController (REST endpoint → ProducerTemplate → camel-lite)
 *   - CamelRoutes (direct:inbound, timer:heartbeat, master:example-app)
 *
 * Run:
 *   npm start                  # http://localhost:3000
 *
 * Test:
 *   curl http://localhost:3000/
 *   curl -X POST http://localhost:3000/message \
 *     -H 'Content-Type: application/json' \
 *     -d '{"text":"hello from Hono"}'
 */

import { Boot } from '@alt-javascript/boot';
import { ApplicationContext, Context, Singleton } from '@alt-javascript/cdi';
import { honoStarter } from '@alt-javascript/boot-hono';
import { camelLiteAutoConfiguration } from '@alt-javascript/boot-camel-lite-starter';
import { camelLiteExtrasAutoConfiguration } from '@alt-javascript/boot-camel-lite-extras-starter';
import { MessageController } from './src/MessageController.js';
import { CamelRoutes } from './src/CamelRoutes.js';

// ---------------------------------------------------------------------------
// Load config — Boot.boot() picks up config/default.yaml automatically
// ---------------------------------------------------------------------------

await Boot.boot();
const config = Boot.root('config');

// ---------------------------------------------------------------------------
// Build CDI component arrays for camel-lite (core + extras)
// ---------------------------------------------------------------------------

const [coreConfig, extrasConfig] = await Promise.all([
  camelLiteAutoConfiguration(),
  camelLiteExtrasAutoConfiguration(),
]);

// ---------------------------------------------------------------------------
// Unified ApplicationContext: Hono + camel-lite + app beans
// ---------------------------------------------------------------------------

const appContext = new ApplicationContext({
  config,
  contexts: [
    // Hono server + middleware
    honoStarter(),
    // camel-lite core (CamelLiteContext, RouteRegistry, component beans x8)
    coreConfig,
    // camel-lite extras (amqp/sql/nosql/master — amqp/sql/nosql disabled in config)
    extrasConfig,
    // Application beans
    [
      { name: 'messageController', Reference: MessageController,  scope: 'singleton' },
      { name: 'camelRoutes',       Reference: CamelRoutes,        scope: 'singleton' },
    ],
  ],
});

await appContext.start();
