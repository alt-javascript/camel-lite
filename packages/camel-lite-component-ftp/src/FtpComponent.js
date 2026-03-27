import { Component } from 'camel-lite-core';
import FtpEndpoint from './FtpEndpoint.js';

class FtpComponent extends Component {
  #endpoints = new Map();

  createEndpoint(uri, remaining, parameters, context) {
    if (this.#endpoints.has(uri)) {
      return this.#endpoints.get(uri);
    }
    const endpoint = new FtpEndpoint(uri, remaining, parameters, context);
    this.#endpoints.set(uri, endpoint);
    return endpoint;
  }
}

export { FtpComponent };
export default FtpComponent;
