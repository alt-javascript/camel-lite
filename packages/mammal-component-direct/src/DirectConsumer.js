import { Consumer } from 'mammal-core';

class DirectConsumer extends Consumer {
  #uri;
  #context;
  #pipeline;

  constructor(uri, context, pipeline) {
    super();
    this.#uri = uri;
    this.#context = context;
    this.#pipeline = pipeline;
  }

  get uri() {
    return this.#uri;
  }

  async start() {
    this.#context.registerConsumer(this.#uri, this);
  }

  async stop() {
    this.#context.registerConsumer(this.#uri, null);
  }

  async process(exchange) {
    return this.#pipeline.run(exchange);
  }
}

export { DirectConsumer };
export default DirectConsumer;
