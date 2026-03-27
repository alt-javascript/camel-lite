import { Endpoint } from 'camel-lite-core';
import HttpProducer from './HttpProducer.js';

class HttpEndpoint extends Endpoint {
  #uri;
  #url;
  #method;

  constructor(uri, remaining, parameters, context) {
    super();
    this.#uri = uri;

    const params = parameters instanceof URLSearchParams
      ? parameters
      : new URLSearchParams(typeof parameters === 'string' ? parameters : '');

    this.#method = (params.get('method') ?? 'GET').toUpperCase();

    // Reconstruct the full URL from the original URI:
    // 'http:example.com/path?method=GET' → 'http://example.com/path'
    // Strip the camel-lite scheme prefix and any component-level query params.
    // The URI already contains the real scheme (http/https) so we just fix the
    // double-colon: 'http:host/path' → 'http://host/path'
    const colonIdx = uri.indexOf(':');
    const scheme = colonIdx >= 0 ? uri.slice(0, colonIdx) : 'http';
    const afterScheme = colonIdx >= 0 ? uri.slice(colonIdx + 1) : uri;

    // Strip leading slashes that aren't part of the authority (Camel URIs use single colon)
    // then reconstruct proper URL
    const withoutLeadingSlashes = afterScheme.replace(/^\/\//, '');

    // Strip component-level query params (method=, etc.) — keep only real URL query params
    // by rebuilding: take the raw remaining which has path+query, but strip known params
    const realParams = new URLSearchParams(params);
    realParams.delete('method');
    const queryStr = realParams.toString();
    const pathWithoutQuery = remaining.split('?')[0];
    this.#url = `${scheme}://${pathWithoutQuery}${queryStr ? '?' + queryStr : ''}`;
  }

  get uri() { return this.#uri; }
  get url() { return this.#url; }
  get method() { return this.#method; }

  createProducer() {
    return new HttpProducer(this.#url, this.#method);
  }

  createConsumer() {
    throw new Error('http: component is producer-only (see D005)');
  }
}

export { HttpEndpoint };
export default HttpEndpoint;
