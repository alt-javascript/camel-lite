import { Producer } from '@alt-javascript/camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/HttpProducer');

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

class HttpProducer extends Producer {
  #url;
  #method;

  constructor(url, method = 'GET') {
    super();
    this.#url = url;
    this.#method = method.toUpperCase();
  }

  get url() { return this.#url; }
  get method() { return this.#method; }

  async send(exchange) {
    // Method: CamelHttpMethod header > constructor default
    const method = (exchange.in.getHeader('CamelHttpMethod') ?? this.#method).toUpperCase();

    // Optional override URL from header
    const url = exchange.in.getHeader('CamelHttpUri') ?? this.#url;

    // Build request body for POST/PUT/PATCH
    let body = undefined;
    if (BODY_METHODS.has(method) && exchange.in.body != null) {
      body = typeof exchange.in.body === 'string'
        ? exchange.in.body
        : JSON.stringify(exchange.in.body);
    }

    log.debug(`HTTP ${method} ${url}`);

    const response = await fetch(url, { method, body });

    log.info(`HTTP ${response.status} ${url}`);

    const responseBody = await response.text();

    exchange.out.body = responseBody;
    exchange.out.setHeader('CamelHttpResponseCode', response.status);
    exchange.out.setHeader('CamelHttpResponseText', response.statusText);

    // Copy all response headers
    for (const [key, value] of response.headers) {
      exchange.out.setHeader(key, value);
    }
  }
}

export { HttpProducer };
export default HttpProducer;
