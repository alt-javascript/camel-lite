import { Consumer } from '@alt-javascript/camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/SqlConsumer');

/**
 * SqlConsumer — stub implementation.
 * sql: is primarily producer-oriented (execute SQL on-demand as a pipeline step).
 * A scheduled poll consumer (timer-driven SELECT) is deferred to a future milestone.
 */
class SqlConsumer extends Consumer {
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
    log.info(`SqlConsumer started: ${uri}`);
  }

  async stop() {
    const { uri, context } = this.#endpoint;
    context.registerConsumer(uri, null);
    log.info(`SqlConsumer stopped: ${uri}`);
  }

  async process(exchange) {
    return this.#pipeline.run(exchange);
  }
}

export { SqlConsumer };
export default SqlConsumer;
