import { Endpoint } from '@alt-javascript/camel-lite-core';
import LogProducer from './LogProducer.js';

class LogEndpoint extends Endpoint {
  #uri;
  #level;
  #showBody;
  #showHeaders;
  #loggerName;

  constructor(uri) {
    super();
    this.#uri = uri;

    // Strip scheme: 'log:output?level=info' → 'output?level=info'
    const remaining = uri.slice(uri.indexOf(':') + 1);

    // Split name from query string manually to preserve case
    const qIdx = remaining.indexOf('?');
    const namePart = qIdx >= 0 ? remaining.slice(0, qIdx) : remaining;
    const queryPart = qIdx >= 0 ? remaining.slice(qIdx + 1) : '';
    const params = new URLSearchParams(queryPart);

    this.#loggerName = namePart || 'log';
    this.#level = (params.get('level') ?? 'info').toLowerCase();
    this.#showBody = params.get('showBody') !== 'false';
    this.#showHeaders = params.get('showHeaders') === 'true';
  }

  get uri() {
    return this.#uri;
  }

  get loggerName() {
    return this.#loggerName;
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

  createProducer() {
    return new LogProducer({
      level: this.#level,
      showBody: this.#showBody,
      showHeaders: this.#showHeaders,
      loggerName: this.#loggerName,
    });
  }

  createConsumer() {
    throw new Error('log: component is producer-only');
  }
}

export { LogEndpoint };
export default LogEndpoint;
