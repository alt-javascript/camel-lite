import { Producer } from 'camel-lite-core';

class SedaProducer extends Producer {
  #uri;
  #queue;

  constructor(uri, queue) {
    super();
    this.#uri = uri;
    this.#queue = queue;
  }

  get uri() {
    return this.#uri;
  }

  async send(exchange) {
    // Fire-and-forget: enqueue and return immediately.
    // SedaQueueFullError propagates to the caller if the queue is at capacity.
    this.#queue.enqueue(exchange);
  }
}

export { SedaProducer };
export default SedaProducer;
