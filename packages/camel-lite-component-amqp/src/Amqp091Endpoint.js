import { AmqpEndpointBase } from './AmqpEndpointBase.js';
import { Amqp091Producer } from './Amqp091Producer.js';
import { Amqp091Consumer } from './Amqp091Consumer.js';

/**
 * AMQP 0-9-1 endpoint (backed by amqplib, for RabbitMQ).
 * clientFactory is injected for testability; defaults to the amqplib factory wired in AmqpComponent.
 */
class Amqp091Endpoint extends AmqpEndpointBase {
  #clientFactory;

  constructor(uri, host, port, queue, jmsMapping, context, component, clientFactory) {
    super(uri, host, port, queue, jmsMapping, context, component);
    this.#clientFactory = clientFactory;
  }

  get clientFactory() { return this.#clientFactory; }

  createProducer() {
    return new Amqp091Producer(this);
  }

  createConsumer(pipeline) {
    return new Amqp091Consumer(this, pipeline);
  }
}

export { Amqp091Endpoint };
export default Amqp091Endpoint;
