import { Producer } from 'mammal-core';
import { CycleDetectedError } from 'mammal-core';

const STACK_KEY = 'mammal.directStack';

class DirectProducer extends Producer {
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

  async send(exchange) {
    const stack = exchange.getProperty(STACK_KEY) || [];

    if (stack.includes(this.#uri)) {
      throw new CycleDetectedError(this.#uri);
    }

    const newStack = [...stack, this.#uri];
    exchange.setProperty(STACK_KEY, newStack);

    const consumer = this.#context.getConsumer(this.#uri);
    if (!consumer) {
      exchange.setProperty(STACK_KEY, stack);
      throw new Error('No consumer registered for: ' + this.#uri);
    }

    try {
      await consumer.process(exchange);
    } finally {
      exchange.setProperty(STACK_KEY, stack);
    }
  }
}

export { DirectProducer };
export default DirectProducer;
