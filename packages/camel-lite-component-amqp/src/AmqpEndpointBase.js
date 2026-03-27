import { Endpoint } from 'camel-lite-core';

/**
 * Shared base for AMQP endpoints.
 * Holds the parsed URI state; subclasses provide createProducer/createConsumer.
 */
class AmqpEndpointBase extends Endpoint {
  #uri;
  #host;
  #port;
  #queue;
  #jmsMapping;
  #context;
  #component;

  constructor(uri, host, port, queue, jmsMapping, context, component) {
    super();
    this.#uri = uri;
    this.#host = host;
    this.#port = port;
    this.#queue = queue;
    this.#jmsMapping = jmsMapping;
    this.#context = context;
    this.#component = component;
  }

  get uri() { return this.#uri; }
  get host() { return this.#host; }
  get port() { return this.#port; }
  get queue() { return this.#queue; }
  get jmsMapping() { return this.#jmsMapping; }
  get context() { return this.#context; }
  get component() { return this.#component; }
}

export { AmqpEndpointBase };
export default AmqpEndpointBase;
