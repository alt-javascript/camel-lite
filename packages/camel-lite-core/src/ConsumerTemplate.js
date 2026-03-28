import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/ConsumerTemplate');

/**
 * ConsumerTemplate — high-level API for polling messages from endpoints
 * registered in a running CamelContext.
 *
 * Any consumer that exposes a `poll(timeoutMs)` method is supported.
 * For push-model endpoints (direct:, timer:, etc.) you must declare the URI
 * in `ctx.pollingUris` before starting the context so CamelContext wraps it
 * with a PollingConsumerAdapter.
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
    // Validate URI format
    this.#scheme(uri);

    log.info(`ConsumerTemplate polling from ${uri}`);

    const consumer = this.#context.getConsumer(uri);
    if (!consumer) {
      throw new Error(`ConsumerTemplate: no consumer registered for '${uri}' — is the context started?`);
    }

    if (typeof consumer.poll !== 'function') {
      throw new Error(
        `ConsumerTemplate: consumer for '${uri}' does not support polling — wrap it with PollingConsumerAdapter`
      );
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
