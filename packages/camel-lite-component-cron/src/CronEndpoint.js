import { Endpoint, CamelError } from 'camel-lite-core';
import { validate } from 'node-cron';
import CronConsumer from './CronConsumer.js';

class CronEndpoint extends Endpoint {
  #uri;
  #name;
  #schedule;
  #timezone;
  #context;

  constructor(uri, remaining, parameters, context) {
    super();
    this.#uri = uri;
    this.#name = remaining || 'cron';
    this.#context = context;

    const params = parameters instanceof URLSearchParams
      ? parameters
      : new URLSearchParams(typeof parameters === 'string' ? parameters : '');

    const schedule = params.get('schedule');
    if (!schedule) {
      throw new CamelError(`cron: URI missing required 'schedule' parameter: ${uri}`);
    }
    // node-cron uses + as space in URI query — decode it
    const decoded = decodeURIComponent(schedule.replace(/\+/g, ' '));
    if (!validate(decoded)) {
      throw new CamelError(`cron: invalid cron expression '${decoded}' in URI: ${uri}`);
    }
    this.#schedule = decoded;
    this.#timezone = params.get('timezone') ?? 'UTC';
  }

  get uri() { return this.#uri; }
  get name() { return this.#name; }
  get schedule() { return this.#schedule; }
  get timezone() { return this.#timezone; }

  createConsumer(pipeline) {
    return new CronConsumer(this.#uri, this.#name, this.#schedule, this.#timezone, this.#context, pipeline);
  }
}

export { CronEndpoint };
export default CronEndpoint;
