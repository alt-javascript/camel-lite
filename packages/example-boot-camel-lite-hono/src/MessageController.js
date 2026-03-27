/**
 * MessageController — receives POST /message and forwards to camel-lite via ProducerTemplate.
 *
 * The camelProducerTemplate bean is auto-wired by CDI (null-property convention).
 * Routes are defined in CamelRoutes (see src/CamelRoutes.js).
 */
export class MessageController {
  static qualifier = 'example-boot-camel-lite-hono/MessageController';

  static __routes = [
    { method: 'GET',  path: '/',        handler: 'health'  },
    { method: 'POST', path: '/message', handler: 'receive' },
  ];

  constructor() {
    this.logger = null;                  // autowired by CDI
    this.camelProducerTemplate = null;   // autowired from boot-camel-lite-starter
    this.appName    = '${app.name:camel-lite-hono-example}';
    this.appVersion = '${app.version:1.0.0}';
  }

  init() {
    this.logger?.info('MessageController ready');
  }

  health() {
    return { status: 'ok', app: this.appName, version: this.appVersion };
  }

  async receive(request) {
    const body = request.body ?? {};
    this.logger?.info(`POST /message received: ${JSON.stringify(body)}`);

    const exchange = await this.camelProducerTemplate.sendBody('direct:inbound', body);

    if (exchange.isFailed()) {
      this.logger?.error(`Route error: ${exchange.exception?.message}`);
      return { received: false, error: exchange.exception?.message };
    }

    return { received: true, body: exchange.in.body };
  }
}
