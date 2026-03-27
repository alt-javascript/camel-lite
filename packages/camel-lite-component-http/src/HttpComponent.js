import { Component } from '@alt-javascript/camel-lite-core';
import HttpEndpoint from './HttpEndpoint.js';

class HttpComponent extends Component {
  createEndpoint(uri, remaining, parameters, context) {
    return new HttpEndpoint(uri, remaining, parameters, context);
  }
}

export { HttpComponent };
export default HttpComponent;
