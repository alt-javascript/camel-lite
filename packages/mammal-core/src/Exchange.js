import Message from './Message.js';

class Exchange {
  #in;
  #out;
  #pattern;
  #properties = new Map();
  #exception = null;

  constructor(pattern = 'InOnly') {
    this.#pattern = pattern;
    this.#in = new Message();
    this.#out = new Message();
  }

  get in() {
    return this.#in;
  }

  get out() {
    return this.#out;
  }

  get pattern() {
    return this.#pattern;
  }

  get properties() {
    return this.#properties;
  }

  get exception() {
    return this.#exception;
  }

  set exception(value) {
    this.#exception = value;
  }

  getProperty(key) {
    return this.#properties.get(key);
  }

  setProperty(key, value) {
    this.#properties.set(key, value);
  }

  isFailed() {
    return this.#exception != null;
  }
}

export { Exchange };
export default Exchange;
