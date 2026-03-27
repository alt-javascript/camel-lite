import { Consumer } from '@alt-javascript/camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/SedaConsumer');

class SedaConsumer extends Consumer {
  #uri;
  #context;
  #pipeline;
  #queue;
  #concurrentConsumers;
  #workerPromises = [];

  constructor(uri, context, pipeline, queue, concurrentConsumers = 1) {
    super();
    this.#uri = uri;
    this.#context = context;
    this.#pipeline = pipeline;
    this.#queue = queue;
    this.#concurrentConsumers = concurrentConsumers;
  }

  get uri() {
    return this.#uri;
  }

  async start() {
    this.#context.registerConsumer(this.#uri, this);
    log.info(`SEDA consumer started: ${this.#uri} (concurrentConsumers: ${this.#concurrentConsumers})`);

    for (let i = 0; i < this.#concurrentConsumers; i++) {
      const workerId = i;
      const workerPromise = this.#runWorker(workerId);
      this.#workerPromises.push(workerPromise);
    }
  }

  async #runWorker(workerId) {
    log.debug(`Worker ${workerId} started for ${this.#uri}`);
    while (true) {
      const exchange = await this.#queue.dequeue();
      if (exchange === null) {
        // Queue closed — drain complete
        break;
      }
      log.debug(`Worker ${workerId} dequeued exchange ${exchange.in.messageId} from ${this.#uri}`);
      try {
        await this.#pipeline.run(exchange);
      } catch (err) {
        // Pipeline.run() captures errors into exchange.exception — this catch is a safety net
        log.error(`Worker ${workerId} error processing exchange ${exchange.in.messageId}: ${err.message}`);
      }
    }
    log.debug(`Worker ${workerId} exiting for ${this.#uri}`);
  }

  /**
   * Poll the queue for an exchange, waiting at most timeoutMs milliseconds.
   * Returns the Exchange if one is available, or null on timeout.
   * Used by ConsumerTemplate to drain a message from outside the route pipeline.
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<Exchange|null>}
   */
  async poll(timeoutMs = 5000) {
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const item = await Promise.race([this.#queue.dequeue(), timeout]);
    clearTimeout(timer);
    return item;
  }

  async stop() {
    // Close the queue — unblocks all waiting dequeues with null
    this.#queue.close();
    // Drain all worker loops
    await Promise.all(this.#workerPromises);
    this.#workerPromises = [];
    this.#context.registerConsumer(this.#uri, null);
    log.info(`SEDA consumer stopped: ${this.#uri}`);
  }
}

export { SedaConsumer };
export default SedaConsumer;
