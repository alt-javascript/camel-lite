import { Producer } from 'mammal-core';

const VALID_LEVELS = new Set(['log', 'info', 'warn', 'error', 'debug']);

class LogProducer extends Producer {
  #level;
  #showBody;
  #showHeaders;
  #loggerName;

  constructor({ level, showBody, showHeaders, loggerName } = {}) {
    super();
    this.#level = VALID_LEVELS.has(level) ? level : 'log';
    this.#showBody = showBody !== false;
    this.#showHeaders = showHeaders === true;
    this.#loggerName = loggerName || 'log';
  }

  get level() {
    return this.#level;
  }

  get showBody() {
    return this.#showBody;
  }

  get showHeaders() {
    return this.#showHeaders;
  }

  get loggerName() {
    return this.#loggerName;
  }

  async send(exchange) {
    const parts = [this.#loggerName];

    if (this.#showBody) {
      parts.push('body: ' + JSON.stringify(exchange.in.body));
    }

    if (this.#showHeaders && exchange.in.headers) {
      const headers = exchange.in.headers instanceof Map
        ? Object.fromEntries(exchange.in.headers)
        : exchange.in.headers;
      parts.push('headers: ' + JSON.stringify(headers));
    }

    const message = parts.join(' ');
    console[this.#level](message);
  }
}

export { LogProducer };
export default LogProducer;
