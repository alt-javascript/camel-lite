import { Component } from 'camel-lite-core';
import FileEndpoint from './FileEndpoint.js';

class FileComponent extends Component {
  // Endpoint cache — same path returns same endpoint
  #endpoints = new Map();

  createEndpoint(uri, remaining, parameters, context) {
    if (this.#endpoints.has(uri)) {
      return this.#endpoints.get(uri);
    }
    const endpoint = new FileEndpoint(uri, remaining, parameters, context);
    this.#endpoints.set(uri, endpoint);
    return endpoint;
  }
}

export { FileComponent };
export default FileComponent;
