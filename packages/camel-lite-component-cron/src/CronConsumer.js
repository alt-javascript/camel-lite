import { Consumer, Exchange } from 'camel-lite-core';
import { schedule as cronSchedule } from 'node-cron';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/CronConsumer');

class CronConsumer extends Consumer {
  #uri;
  #name;
  #schedule;
  #timezone;
  #context;
  #pipeline;
  #task = null;

  constructor(uri, name, schedule, timezone, context, pipeline) {
    super();
    this.#uri = uri;
    this.#name = name;
    this.#schedule = schedule;
    this.#timezone = timezone;
    this.#context = context;
    this.#pipeline = pipeline;
  }

  get uri() { return this.#uri; }

  async start() {
    this.#context.registerConsumer(this.#uri, this);
    log.info(`Cron consumer started: ${this.#uri} schedule='${this.#schedule}' tz='${this.#timezone}'`);

    this.#task = cronSchedule(this.#schedule, async () => {
      const exchange = new Exchange();
      exchange.in.setHeader('CamelCronName', this.#name);
      exchange.in.setHeader('CamelCronFiredTime', new Date());
      exchange.in.body = null;

      log.debug(`Cron ${this.#name} fired`);

      try {
        await this.#pipeline.run(exchange);
      } catch (err) {
        log.error(`Cron ${this.#name} error: ${err.message}`);
      }
    }, { timezone: this.#timezone });
  }

  async stop() {
    if (this.#task) {
      this.#task.stop();
      this.#task = null;
    }
    this.#context.registerConsumer(this.#uri, null);
    log.info(`Cron consumer stopped: ${this.#uri}`);
  }
}

export { CronConsumer };
export default CronConsumer;
