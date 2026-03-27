import { Producer } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { JmsMapper } from './JmsMapper.js';
import { createContainer } from './RheaClientFactory.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/Amqp10Producer');

/**
 * Sends a single exchange as an AMQP 1.0 message via rhea.
 * Opens a connection per send() call (stateless — no persistent connection for producers).
 * The connection is closed after the message is sent/rejected/released.
 */
class Amqp10Producer extends Producer {
  #endpoint;

  constructor(endpoint) {
    super();
    this.#endpoint = endpoint;
  }

  async send(exchange) {
    const { host, port, queue, jmsMapping, clientFactory } = this.#endpoint;
    const brokerRef = `${host}:${port}/${queue}`;

    // clientFactory can override container creation for tests
    const container = clientFactory ? clientFactory() : createContainer();

    return new Promise((resolve, reject) => {
      const conn = container.connect({ host, port: Number(port) });

      conn.on('connection_open', () => {
        const sender = conn.open_sender(queue);

        sender.on('sendable', () => {
          const body = exchange.in.body;
          const content = typeof body === 'string' || Buffer.isBuffer(body)
            ? body
            : JSON.stringify(body);

          const message = { body: content };

          if (jmsMapping) {
            JmsMapper.toAmqp10(exchange, message);
          }

          log.debug(`AMQP 1.0 send → ${brokerRef}`);
          sender.send(message);
          sender.close();
          conn.close();
        });

        sender.on('rejected', (ctx) => {
          conn.close();
          const err = new Error(`AMQP 1.0 message rejected by ${brokerRef}: ${JSON.stringify(ctx.delivery?.remote_state)}`);
          log.error(err.message);
          reject(err);
        });
      });

      conn.on('connection_close', () => {
        resolve();
      });

      conn.on('disconnected', (ctx) => {
        if (ctx.error) {
          log.error(`AMQP 1.0 disconnected from ${brokerRef}: ${ctx.error.message}`);
          reject(ctx.error);
        }
      });
    });
  }
}

export { Amqp10Producer };
export default Amqp10Producer;
