import { Endpoint } from '@alt-javascript/camel-lite-core';
import DirectProducer from './DirectProducer.js';
import DirectConsumer from './DirectConsumer.js';

class DirectEndpoint extends Endpoint {
  #uri;
  #context;

  constructor(uri, context) {
    super();
    this.#uri = uri;
    this.#context = context;
  }

  get uri() {
    return this.#uri;
  }

  createProducer() {
    return new DirectProducer(this.#uri, this.#context);
  }

  createConsumer(pipeline) {
    return new DirectConsumer(this.#uri, this.#context, pipeline);
  }
}

export { DirectEndpoint };
export default DirectEndpoint;
