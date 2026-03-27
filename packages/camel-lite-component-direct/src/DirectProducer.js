import { Producer } from '@alt-javascript/camel-lite-core';
import { CycleDetectedError } from '@alt-javascript/camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/DirectProducer');

const STACK_KEY = 'camel.directStack';

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
      log.error(`Cycle detected sending to: ${this.#uri}`);
      throw new CycleDetectedError(this.#uri);
    }

    log.debug(`Dispatching exchange to: ${this.#uri}`);

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
