import { SedaQueueFullError } from '@alt-javascript/camel-lite-core';

class SedaQueue {
  #items = [];
  #waiters = [];
  #closed = false;
  #maxSize;

  constructor(maxSize = 0) {
    this.#maxSize = maxSize;
  }

  enqueue(item) {
    if (this.#closed) {
      throw new Error('SedaQueue is closed');
    }
    if (this.#maxSize > 0 && this.#items.length >= this.#maxSize) {
      throw new SedaQueueFullError(this.#maxSize);
    }
    if (this.#waiters.length > 0) {
      // A consumer is already waiting — deliver directly without touching the queue
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

  get size() {
    return this.#items.length;
  }

  get closed() {
    return this.#closed;
  }
}

export { SedaQueue };
export default SedaQueue;
