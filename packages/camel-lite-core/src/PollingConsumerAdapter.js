import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/PollingConsumerAdapter');

/**
 * Inline async queue — same mechanics as SedaQueue without the SedaQueueFullError
 * dependency.  Used internally by PollingConsumerAdapter.
 */
class BufferQueue {
  #items = [];
  #waiters = [];
  #closed = false;

  enqueue(item) {
    if (this.#closed) return; // silently drop after close
    if (this.#waiters.length > 0) {
      this.#waiters.shift().resolve(item);
    } else {
      this.#items.push(item);
    }
  }

  dequeue() {
    if (this.#items.length > 0) {
      return Promise.resolve(this.#items.shift());
    }
    if (this.#closed) {
      return Promise.resolve(null);
    }
    return new Promise(resolve => this.#waiters.push({ resolve }));
  }

  close() {
    this.#closed = true;
    for (const waiter of this.#waiters) {
      waiter.resolve(null);
    }
    this.#waiters = [];
  }

  get closed() {
    return this.#closed;
  }
}

/**
 * PollingConsumerAdapter — wraps any push-model Consumer (timer:, direct:, etc.)
 * and exposes a `poll(timeoutMs)` method compatible with ConsumerTemplate.
 *
 * The adapter injects a "capture pipeline" into the real consumer at construction
 * time.  Whenever the real consumer fires an exchange into that pipeline, the
 * adapter enqueues it in an internal BufferQueue.  Callers can then drain the
 * queue via `poll()`.
 *
 * Usage (handled automatically by CamelContext when pollingUris is set):
 *
 *   const adapter = new PollingConsumerAdapter();
 *   const realConsumer = endpoint.createConsumer(adapter.capturedPipeline);
 *   adapter.setConsumer(realConsumer);
 *   await adapter.start();
 *   const exchange = await adapter.poll(5000);
 *   await adapter.stop();
 */
class PollingConsumerAdapter {
  #consumer = null;
  #queue = new BufferQueue();

  /**
   * The fake pipeline that the real consumer fires exchanges into.
   * Returns a plain object with a `run(exchange)` method so it satisfies
   * the Pipeline interface expected by all consumers.
   */
  get capturedPipeline() {
    return {
      run: (exchange) => {
        log.debug(`PollingConsumerAdapter captured exchange ${exchange?.in?.messageId}`);
        this.#queue.enqueue(exchange);
        return Promise.resolve(exchange);
      },
    };
  }

  /**
   * Inject the real consumer after creation (two-phase init).
   * @param {Consumer} consumer
   */
  setConsumer(consumer) {
    this.#consumer = consumer;
  }

  /**
   * Called by DirectProducer when it looks up the consumer by URI and calls
   * process() on it directly.  Routes the exchange through the capture queue
   * so ConsumerTemplate can drain it.
   * @param {Exchange} exchange
   * @returns {Promise<Exchange>}
   */
  async process(exchange) {
    log.debug(`PollingConsumerAdapter.process() captured exchange ${exchange?.in?.messageId}`);
    this.#queue.enqueue(exchange);
    return exchange;
  }

  /**
   * Start the real consumer.
   */
  async start() {
    if (this.#consumer) {
      await this.#consumer.start();
    }
  }

  /**
   * Stop the real consumer and close the buffer queue.
   */
  async stop() {
    if (this.#consumer) {
      await this.#consumer.stop();
    }
    this.#queue.close();
  }

  /**
   * Poll for the next exchange, waiting at most timeoutMs milliseconds.
   * Returns the Exchange or null on timeout.
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<Exchange|null>}
   */
  async poll(timeoutMs = 5000) {
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    log.debug(`PollingConsumerAdapter polling (timeout=${timeoutMs}ms)`);
    const item = await Promise.race([this.#queue.dequeue(), timeout]);
    clearTimeout(timer);
    return item;
  }
}

export { PollingConsumerAdapter };
export default PollingConsumerAdapter;
