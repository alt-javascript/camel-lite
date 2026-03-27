import { Consumer, Exchange } from '@alt-javascript/camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/TimerConsumer');

class TimerConsumer extends Consumer {
  #uri;
  #name;
  #period;
  #delay;
  #repeatCount;
  #context;
  #pipeline;
  #counter = 0;
  #intervalHandle = null;
  #delayHandle = null;
  #stopped = false;

  constructor(uri, name, period, delay, repeatCount, context, pipeline) {
    super();
    this.#uri = uri;
    this.#name = name;
    this.#period = period;
    this.#delay = delay;
    this.#repeatCount = repeatCount;
    this.#context = context;
    this.#pipeline = pipeline;
  }

  get uri() { return this.#uri; }

  async start() {
    this.#stopped = false;
    this.#counter = 0;
    this.#context.registerConsumer(this.#uri, this);
    log.info(`Timer consumer started: ${this.#uri} (period:${this.#period}ms delay:${this.#delay}ms repeatCount:${this.#repeatCount})`);

    const fire = async () => {
      if (this.#stopped) return;
      this.#counter++;
      const exchange = new Exchange();
      exchange.in.setHeader('CamelTimerName', this.#name);
      exchange.in.setHeader('CamelTimerFiredTime', new Date());
      exchange.in.setHeader('CamelTimerCounter', this.#counter);
      exchange.in.body = null;

      log.debug(`Timer ${this.#name} firing (counter=${this.#counter})`);

      try {
        await this.#pipeline.run(exchange);
      } catch (err) {
        log.error(`Timer ${this.#name} error on fire ${this.#counter}: ${err.message}`);
      }

      if (this.#repeatCount > 0 && this.#counter >= this.#repeatCount) {
        log.info(`Timer ${this.#name} reached repeatCount (${this.#repeatCount}), stopping`);
        this.#clearTimers();
      }
    };

    const startInterval = () => {
      if (this.#stopped) return;
      // fire immediately (Camel timer fires at t=0 before first interval)
      fire();
      if (this.#repeatCount !== 1) {
        this.#intervalHandle = setInterval(fire, this.#period);
      }
    };

    if (this.#delay > 0) {
      this.#delayHandle = setTimeout(startInterval, this.#delay);
    } else {
      startInterval();
    }
  }

  #clearTimers() {
    if (this.#intervalHandle !== null) {
      clearInterval(this.#intervalHandle);
      this.#intervalHandle = null;
    }
    if (this.#delayHandle !== null) {
      clearTimeout(this.#delayHandle);
      this.#delayHandle = null;
    }
  }

  async stop() {
    this.#stopped = true;
    this.#clearTimers();
    this.#context.registerConsumer(this.#uri, null);
    log.info(`Timer consumer stopped: ${this.#uri}`);
  }
}

export { TimerConsumer };
export default TimerConsumer;
