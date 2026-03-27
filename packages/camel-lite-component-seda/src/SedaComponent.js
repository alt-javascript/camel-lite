import { Component } from 'camel-lite-core';
import SedaEndpoint from './SedaEndpoint.js';

class SedaComponent extends Component {
  // Endpoint cache — ensures producer and consumer for the same URI share one queue
  #endpoints = new Map();

  createEndpoint(uri, remaining, parameters, context) {
    if (this.#endpoints.has(uri)) {
      return this.#endpoints.get(uri);
    }
    const endpoint = new SedaEndpoint(uri, remaining, parameters, context);
    this.#endpoints.set(uri, endpoint);
    return endpoint;
  }

  // Called by CamelContext.stop() to allow cleanup if needed
  clearEndpoints() {
    this.#endpoints.clear();
  }
}

export { SedaComponent };
export default SedaComponent;
