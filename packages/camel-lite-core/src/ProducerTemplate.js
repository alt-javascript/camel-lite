import { LoggerFactory } from '@alt-javascript/logger';
import { Exchange } from './Exchange.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/ProducerTemplate');

/**
 * ProducerTemplate — high-level API for sending messages to any endpoint
 * registered in a running CamelContext.
 *
 * Usage:
 *   const pt = new ProducerTemplate(context);
 *   const exchange = await pt.sendBody('direct:myRoute', 'hello');
 *   const result   = await pt.requestBody('direct:myRoute', 'hello');
 */
class ProducerTemplate {
  #context;

  constructor(context) {
    if (!context) throw new Error('ProducerTemplate requires a CamelContext');
    this.#context = context;
  }

  /**
   * Low-level: resolve a producer for the given URI and send the exchange as-is.
   * Returns the exchange after send completes.
   * @param {string} uri
   * @param {Exchange} exchange
   * @returns {Promise<Exchange>}
   */
  async send(uri, exchange) {
    const producer = this.#resolveProducer(uri);
    log.info(`ProducerTemplate sending to ${uri}`);
    log.debug(`ProducerTemplate exchange id=${exchange.in.messageId}`);
    await producer.send(exchange);
    return exchange;
  }

  /**
   * InOnly send — creates an exchange with the given body and headers and sends it.
   * Returns the exchange after completion (check exchange.exception for errors).
   * @param {string} uri
   * @param {*} body
   * @param {Object} [headers={}]
   * @returns {Promise<Exchange>}
   */
  async sendBody(uri, body, headers = {}) {
    const exchange = this.#makeExchange('InOnly', body, headers);
    return this.send(uri, exchange);
  }

  /**
   * InOut request-reply — creates an exchange with the given body and sends it.
   * Returns exchange.out.body if set, otherwise exchange.in.body.
   * @param {string} uri
   * @param {*} body
   * @param {Object} [headers={}]
   * @returns {Promise<*>}
   */
  async requestBody(uri, body, headers = {}) {
    const exchange = this.#makeExchange('InOut', body, headers);
    await this.send(uri, exchange);
    // Prefer out body; fall back to in body (in-place mutation pattern)
    const outBody = exchange.out.body;
    return (outBody !== null && outBody !== undefined) ? outBody : exchange.in.body;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  #makeExchange(pattern, body, headers) {
    const exchange = new Exchange(pattern);
    exchange.in.body = body;
    for (const [k, v] of Object.entries(headers)) {
      exchange.in.setHeader(k, v);
    }
    return exchange;
  }

  #resolveProducer(uri) {
    const colonIdx = uri.indexOf(':');
    if (colonIdx < 0) throw new Error(`ProducerTemplate: invalid URI (no scheme): ${uri}`);
    const scheme = uri.slice(0, colonIdx);
    const rest = uri.slice(colonIdx + 1);
    const qIdx = rest.indexOf('?');
    const remaining = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
    const params = qIdx >= 0 ? new URLSearchParams(rest.slice(qIdx + 1)) : new URLSearchParams();

    const component = this.#context.getComponent(scheme);
    if (!component) throw new Error(`ProducerTemplate: no component registered for scheme '${scheme}'`);

    const endpoint = component.createEndpoint(uri, remaining, params, this.#context);
    return endpoint.createProducer();
  }
}

export { ProducerTemplate };
export default ProducerTemplate;
