import { Component } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { Amqp10Endpoint } from './Amqp10Endpoint.js';
import { Amqp091Endpoint } from './Amqp091Endpoint.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/AmqpComponent');

/**
 * AmqpComponent — dual-protocol AMQP component.
 *
 * URI format:
 *   amqp://host:port/queue?protocol=1.0&jms=false
 *   amqp://host:port/queue?protocol=0-9-1&jms=true
 *
 * protocol: '1.0' (default) → rhea / AMQP 1.0 (Artemis, Azure Service Bus)
 * protocol: '0-9-1'         → amqplib / AMQP 0-9-1 (RabbitMQ)
 * jms:      'true'          → apply JMS 2.x header mapping
 *
 * clientFactory (optional): inject a factory fn for testing.
 *   setClientFactory10(fn)   — for AMQP 1.0 tests
 *   setClientFactory091(fn)  — for AMQP 0-9-1 tests
 */
class AmqpComponent extends Component {
  #endpoints = new Map();
  #clientFactory10 = null;
  #clientFactory091 = null;

  /** Inject a custom AMQP 1.0 connection factory (for unit tests). */
  setClientFactory10(fn) {
    this.#clientFactory10 = fn;
    return this;
  }

  /** Inject a custom AMQP 0-9-1 connection factory (for unit tests). */
  setClientFactory091(fn) {
    this.#clientFactory091 = fn;
    return this;
  }

  createEndpoint(uri, remaining, parameters, context) {
    if (this.#endpoints.has(uri)) {
      return this.#endpoints.get(uri);
    }

    // Parse: uri = 'amqp://host:port/queue?...'
    // CamelContext passes us: uri = full URI, remaining = everything after 'amqp:', params = URLSearchParams
    // But remaining may be '//host:port/queue' — we parse from the full URI string.
    const { host, port, queue, protocol, jmsMapping } = AmqpComponent.#parseUri(uri, parameters);

    log.info(`AmqpComponent creating endpoint: protocol=${protocol}, host=${host}:${port}, queue=${queue}, jms=${jmsMapping}`);

    let endpoint;
    if (protocol === '0-9-1') {
      endpoint = new Amqp091Endpoint(uri, host, port, queue, jmsMapping, context, this, this.#clientFactory091);
    } else {
      // Default: AMQP 1.0
      endpoint = new Amqp10Endpoint(uri, host, port, queue, jmsMapping, context, this, this.#clientFactory10);
    }

    this.#endpoints.set(uri, endpoint);
    return endpoint;
  }

  static #parseUri(uri, parameters) {
    // uri examples:
    //   amqp://localhost:5672/myqueue?protocol=1.0&jms=true
    //   amqp://localhost:5672/myqueue
    // We extract host, port, queue from the URI string directly (case-preserving).

    let working = uri;

    // Strip scheme
    const schemeEnd = working.indexOf('://');
    if (schemeEnd >= 0) working = working.slice(schemeEnd + 3);

    // Strip query string (already in parameters)
    const qIdx = working.indexOf('?');
    if (qIdx >= 0) working = working.slice(0, qIdx);

    // working = 'host:port/queue'
    const slashIdx = working.indexOf('/');
    const hostPort = slashIdx >= 0 ? working.slice(0, slashIdx) : working;
    const queue = slashIdx >= 0 ? working.slice(slashIdx + 1) : 'default';

    const colonIdx = hostPort.lastIndexOf(':');
    const host = colonIdx >= 0 ? hostPort.slice(0, colonIdx) : hostPort;
    const port = colonIdx >= 0 ? parseInt(hostPort.slice(colonIdx + 1), 10) : 5672;

    const protocol = parameters.get('protocol') ?? '1.0';
    const jmsMapping = parameters.get('jms') === 'true';

    return { host, port, queue, protocol, jmsMapping };
  }
}

export { AmqpComponent };
export default AmqpComponent;
