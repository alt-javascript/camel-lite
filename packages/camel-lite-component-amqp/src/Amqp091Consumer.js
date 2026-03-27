import { Consumer, Exchange } from '@alt-javascript/camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { JmsMapper } from './JmsMapper.js';
import { connect } from './AmqplibClientFactory.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/Amqp091Consumer');

/**
 * Receives AMQP 0-9-1 messages via amqplib and drives each through the routing pipeline.
 * Maintains a persistent connection from start() to stop().
 */
class Amqp091Consumer extends Consumer {
  #endpoint;
  #pipeline;
  #connection = null;
  #channel = null;

  constructor(endpoint, pipeline) {
    super();
    this.#endpoint = endpoint;
    this.#pipeline = pipeline;
  }

  async start() {
    const { host, port, queue, jmsMapping, clientFactory, context, uri } = this.#endpoint;
    const url = `amqp://${host}:${port}`;
    const brokerRef = `${host}:${port}/${queue}`;

    context.registerConsumer(uri, this);

    const conn = clientFactory ? await clientFactory(url) : await connect(url);
    this.#connection = conn;

    const ch = await conn.createChannel();
    this.#channel = ch;

    await ch.assertQueue(queue, { durable: false });

    ch.consume(queue, (msg) => {
      if (!msg) return; // consumer cancelled

      log.debug(`AMQP 0-9-1 received ← ${brokerRef}`);

      const exchange = new Exchange();
      exchange.in.body = msg.content.toString('utf8');

      if (jmsMapping) {
        JmsMapper.fromAmqp091(msg, exchange);
      }

      ch.ack(msg);

      this.#pipeline.run(exchange).catch((err) => {
        log.error(`AMQP 0-9-1 pipeline error on ${brokerRef}: ${err.message}`);
      });
    });

    log.info(`AMQP 0-9-1 consumer connected: ${brokerRef}`);
  }

  async stop() {
    const { host, port, queue, context, uri } = this.#endpoint;
    const brokerRef = `${host}:${port}/${queue}`;

    try {
      if (this.#channel) {
        await this.#channel.close().catch(() => { /* already closed */ });
        this.#channel = null;
      }
      if (this.#connection) {
        await this.#connection.close().catch(() => { /* already closed */ });
        this.#connection = null;
      }
    } catch {
      /* swallow — we're stopping */
    }

    context.registerConsumer(uri, null);
    log.info(`AMQP 0-9-1 consumer stopped: ${brokerRef}`);
  }

  /** Called by integration tests to inject a single message into the pipeline. */
  async process(exchange) {
    return this.#pipeline.run(exchange);
  }
}

export { Amqp091Consumer };
export default Amqp091Consumer;
