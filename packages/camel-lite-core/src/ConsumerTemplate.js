import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/ConsumerTemplate');

const SUPPORTED_POLL_SCHEMES = new Set(['seda']);

/**
 * ConsumerTemplate — high-level API for polling messages from queue-based
 * endpoints (currently seda:) registered in a running CamelContext.
 *
 * Only polling-capable endpoints are supported. Push-model endpoints like
 * direct: do not expose a dequeuable queue and will throw a clear error.
 *
 * Usage:
 *   const ct = new ConsumerTemplate(context);
 *   const exchange = await ct.receive('seda:work', 3000);
 *   const body     = await ct.receiveBody('seda:work', 3000);
 */
class ConsumerTemplate {
  #context;

  constructor(context) {
    if (!context) throw new Error('ConsumerTemplate requires a CamelContext');
    this.#context = context;
  }

  /**
   * Poll for an exchange from the given URI.
   * Returns the Exchange, or null if the timeout expires before a message arrives.
   * @param {string} uri
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<Exchange|null>}
   */
  async receive(uri, timeoutMs = 5000) {
    const scheme = this.#scheme(uri);
    if (!SUPPORTED_POLL_SCHEMES.has(scheme)) {
      throw new Error(
        `ConsumerTemplate does not support polling from '${scheme}:'. ` +
        `Supported schemes: ${[...SUPPORTED_POLL_SCHEMES].join(', ')}`
      );
    }

    log.info(`ConsumerTemplate polling from ${uri}`);

    const consumer = this.#context.getConsumer(uri);
    if (!consumer) {
      throw new Error(`ConsumerTemplate: no consumer registered for '${uri}' — is the context started?`);
    }

    return consumer.poll(timeoutMs);
  }

  /**
   * Poll for a message body from the given URI.
   * Returns exchange.in.body, or null if the timeout expires.
   * @param {string} uri
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<*>}
   */
  async receiveBody(uri, timeoutMs = 5000) {
    const exchange = await this.receive(uri, timeoutMs);
    return exchange !== null ? exchange.in.body : null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  #scheme(uri) {
    const idx = uri.indexOf(':');
    if (idx < 0) throw new Error(`ConsumerTemplate: invalid URI (no scheme): ${uri}`);
    return uri.slice(0, idx);
  }
}

export { ConsumerTemplate };
export default ConsumerTemplate;
