import { Endpoint } from '@alt-javascript/camel-lite-core';
import TimerConsumer from './TimerConsumer.js';

class TimerEndpoint extends Endpoint {
  #uri;
  #name;
  #period;
  #delay;
  #repeatCount;
  #context;

  constructor(uri, remaining, parameters, context) {
    super();
    this.#uri = uri;
    this.#name = remaining || 'timer';
    this.#context = context;

    const params = parameters instanceof URLSearchParams
      ? parameters
      : new URLSearchParams(typeof parameters === 'string' ? parameters : '');

    const rawPeriod = params.get('period');
    const rawDelay = params.get('delay');
    const rawRepeat = params.get('repeatCount');

    const parsedPeriod = rawPeriod !== null ? parseInt(rawPeriod, 10) : 1000;
    const parsedDelay = rawDelay !== null ? parseInt(rawDelay, 10) : 0;
    const parsedRepeat = rawRepeat !== null ? parseInt(rawRepeat, 10) : 0;

    this.#period = Math.max(1, Number.isNaN(parsedPeriod) ? 1000 : parsedPeriod);
    this.#delay = Math.max(0, Number.isNaN(parsedDelay) ? 0 : parsedDelay);
    this.#repeatCount = Math.max(0, Number.isNaN(parsedRepeat) ? 0 : parsedRepeat);
  }

  get uri() { return this.#uri; }
  get name() { return this.#name; }
  get period() { return this.#period; }
  get delay() { return this.#delay; }
  get repeatCount() { return this.#repeatCount; }

  createConsumer(pipeline) {
    return new TimerConsumer(this.#uri, this.#name, this.#period, this.#delay, this.#repeatCount, this.#context, pipeline);
  }
}

export { TimerEndpoint };
export default TimerEndpoint;
