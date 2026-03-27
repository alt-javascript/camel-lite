import { Endpoint } from 'camel-lite-core';
import SedaProducer from './SedaProducer.js';
import SedaConsumer from './SedaConsumer.js';
import SedaQueue from './SedaQueue.js';

class SedaEndpoint extends Endpoint {
  #uri;
  #context;
  #concurrentConsumers;
  #size;
  #queue;

  constructor(uri, remaining, parameters, context) {
    super();
    this.#uri = uri;
    this.#context = context;

    // Parse URI params — parameters is a URLSearchParams instance
    const params = parameters instanceof URLSearchParams
      ? parameters
      : new URLSearchParams(typeof parameters === 'string' ? parameters : '');

    this.#concurrentConsumers = Math.max(1, parseInt(params.get('concurrentConsumers') ?? '1', 10) || 1);
    this.#size = Math.max(0, parseInt(params.get('size') ?? '0', 10) || 0);

    // One queue per endpoint, shared by producer and all consumer workers
    this.#queue = new SedaQueue(this.#size);
  }

  get uri() {
    return this.#uri;
  }

  get concurrentConsumers() {
    return this.#concurrentConsumers;
  }

  get size() {
    return this.#size;
  }

  createProducer() {
    return new SedaProducer(this.#uri, this.#queue);
  }

  createConsumer(pipeline) {
    return new SedaConsumer(this.#uri, this.#context, pipeline, this.#queue, this.#concurrentConsumers);
  }
}

export { SedaEndpoint };
export default SedaEndpoint;
