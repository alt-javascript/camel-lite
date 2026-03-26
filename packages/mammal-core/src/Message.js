import { randomUUID } from 'node:crypto';

class Message {
  #body = null;
  #headers = new Map();
  #messageId;

  constructor() {
    this.#messageId = randomUUID();
  }

  get body() {
    return this.#body;
  }

  set body(value) {
    this.#body = value;
  }

  get headers() {
    return this.#headers;
  }

  get messageId() {
    return this.#messageId;
  }

  getHeader(key) {
    return this.#headers.get(key);
  }

  setHeader(key, value) {
    this.#headers.set(key, value);
  }
}

export { Message };
export default Message;
