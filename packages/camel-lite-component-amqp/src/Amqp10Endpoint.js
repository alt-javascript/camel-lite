import { AmqpEndpointBase } from './AmqpEndpointBase.js';
import { Amqp10Producer } from './Amqp10Producer.js';
import { Amqp10Consumer } from './Amqp10Consumer.js';

/**
 * AMQP 1.0 endpoint (backed by rhea).
 * clientFactory is injected for testability; defaults to the rhea factory wired in AmqpComponent.
 */
class Amqp10Endpoint extends AmqpEndpointBase {
  #clientFactory;

  constructor(uri, host, port, queue, jmsMapping, context, component, clientFactory) {
    super(uri, host, port, queue, jmsMapping, context, component);
    this.#clientFactory = clientFactory;
  }

  get clientFactory() { return this.#clientFactory; }

  createProducer() {
    return new Amqp10Producer(this);
  }

  createConsumer(pipeline) {
    return new Amqp10Consumer(this, pipeline);
  }
}

export { Amqp10Endpoint };
export default Amqp10Endpoint;
