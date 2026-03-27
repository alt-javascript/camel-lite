import { Endpoint } from 'camel-lite-core';
import FileProducer from './FileProducer.js';
import FileConsumer from './FileConsumer.js';

class FileEndpoint extends Endpoint {
  #uri;
  #dir;
  #fileName;
  #noop;
  #context;

  constructor(uri, remaining, parameters, context) {
    super();
    this.#uri = uri;
    this.#context = context;

    // remaining is the directory path (everything after 'file:' and before '?')
    this.#dir = remaining;

    const params = parameters instanceof URLSearchParams
      ? parameters
      : new URLSearchParams(typeof parameters === 'string' ? parameters : '');

    this.#fileName = params.get('fileName') ?? null;
    this.#noop = params.get('noop') === 'true';
  }

  get uri() { return this.#uri; }
  get dir() { return this.#dir; }
  get fileName() { return this.#fileName; }
  get noop() { return this.#noop; }

  createProducer() {
    return new FileProducer(this.#dir, this.#fileName);
  }

  createConsumer(pipeline) {
    return new FileConsumer(this.#uri, this.#context, this.#dir, this.#noop);
  }
}

export { FileEndpoint };
export default FileEndpoint;
