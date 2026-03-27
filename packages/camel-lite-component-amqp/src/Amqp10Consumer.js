import { Consumer, Exchange } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { JmsMapper } from './JmsMapper.js';
import { createContainer } from './RheaClientFactory.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/Amqp10Consumer');

/**
 * Receives AMQP 1.0 messages via rhea and drives each through the routing pipeline.
 * Maintains a persistent connection from start() to stop().
 * stop() signals the AbortController and closes the connection gracefully.
 */
class Amqp10Consumer extends Consumer {
  #endpoint;
  #pipeline;
  #connection = null;

  constructor(endpoint, pipeline) {
    super();
    this.#endpoint = endpoint;
    this.#pipeline = pipeline;
  }

  async start() {
    const { host, port, queue, jmsMapping, clientFactory, context, uri } = this.#endpoint;
    const brokerRef = `${host}:${port}/${queue}`;

    context.registerConsumer(uri, this);

    const container = clientFactory ? clientFactory() : createContainer();

    await new Promise((resolve, reject) => {
      const conn = container.connect({ host, port: Number(port) });
      this.#connection = conn;

      conn.on('connection_open', () => {
        conn.open_receiver(queue);
        log.info(`AMQP 1.0 consumer connected: ${brokerRef}`);
        resolve();
      });

      conn.on('message', (ctx) => {
        const msg = ctx.message;
        log.debug(`AMQP 1.0 received ← ${brokerRef}`);

        const exchange = new Exchange();
        const body = msg.body;
        exchange.in.body = Buffer.isBuffer(body) ? body.toString('utf8') : body;

        if (jmsMapping) {
          JmsMapper.fromAmqp10(msg, exchange);
        }

        // Fire-and-forget pipeline execution; exceptions land on exchange.exception
        this.#pipeline.run(exchange).catch((err) => {
          log.error(`AMQP 1.0 pipeline error on ${brokerRef}: ${err.message}`);
        });
      });

      conn.on('disconnected', (ctx) => {
        if (ctx.error) {
          log.error(`AMQP 1.0 disconnected from ${brokerRef}: ${ctx.error.message}`);
          reject(ctx.error);
        }
      });
    });
  }

  async stop() {
    const { host, port, queue, context, uri } = this.#endpoint;
    const brokerRef = `${host}:${port}/${queue}`;

    if (this.#connection) {
      await new Promise((resolve) => {
        const conn = this.#connection;
        this.#connection = null;

        conn.once('connection_close', () => resolve());
        conn.once('disconnected', () => resolve());

        try {
          conn.close();
        } catch {
          resolve();
        }
      });
    }

    context.registerConsumer(uri, null);
    log.info(`AMQP 1.0 consumer stopped: ${brokerRef}`);
  }

  /** Called by integration tests to inject a single message into the pipeline. */
  async process(exchange) {
    return this.#pipeline.run(exchange);
  }
}

export { Amqp10Consumer };
export default Amqp10Consumer;
