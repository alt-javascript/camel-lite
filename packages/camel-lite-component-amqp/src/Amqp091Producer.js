import { Producer } from '@alt-javascript/camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { JmsMapper } from './JmsMapper.js';
import { connect } from './AmqplibClientFactory.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/Amqp091Producer');

/**
 * Sends a single exchange as an AMQP 0-9-1 message via amqplib.
 * Opens a connection per send() call (stateless producer).
 */
class Amqp091Producer extends Producer {
  #endpoint;

  constructor(endpoint) {
    super();
    this.#endpoint = endpoint;
  }

  async send(exchange) {
    const { host, port, queue, jmsMapping, clientFactory } = this.#endpoint;
    const url = `amqp://${host}:${port}`;
    const brokerRef = `${host}:${port}/${queue}`;

    // clientFactory can return a mock connection for tests
    const conn = clientFactory ? await clientFactory(url) : await connect(url);
    try {
      const ch = await conn.createChannel();
      try {
        await ch.assertQueue(queue, { durable: false });

        const body = exchange.in.body;
        const content = typeof body === 'string'
          ? Buffer.from(body, 'utf8')
          : Buffer.isBuffer(body)
            ? body
            : Buffer.from(JSON.stringify(body), 'utf8');

        const options = {};
        if (jmsMapping) {
          JmsMapper.toAmqp091(exchange, options);
        }

        log.debug(`AMQP 0-9-1 send → ${brokerRef}`);
        ch.sendToQueue(queue, content, options);
        await ch.close();
      } finally {
        await ch.close().catch(() => { /* already closed */ });
      }
    } finally {
      await conn.close().catch(() => { /* already closed */ });
      log.debug(`AMQP 0-9-1 connection closed: ${brokerRef}`);
    }
  }
}

export { Amqp091Producer };
export default Amqp091Producer;
