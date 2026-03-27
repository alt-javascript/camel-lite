import { Consumer } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/NosqlConsumer');

/**
 * NosqlConsumer — stub implementation.
 * nosql: is primarily producer-oriented.
 * Change-stream / poll consumer is deferred to a future milestone.
 */
class NosqlConsumer extends Consumer {
  #endpoint;
  #pipeline;

  constructor(endpoint, pipeline) {
    super();
    this.#endpoint = endpoint;
    this.#pipeline = pipeline;
  }

  async start() {
    const { uri, context } = this.#endpoint;
    context.registerConsumer(uri, this);
    log.info(`NosqlConsumer started: ${uri}`);
  }

  async stop() {
    const { uri, context } = this.#endpoint;
    context.registerConsumer(uri, null);
    log.info(`NosqlConsumer stopped: ${uri}`);
  }

  async process(exchange) {
    return this.#pipeline.run(exchange);
  }
}

export { NosqlConsumer };
export default NosqlConsumer;
