import { Component } from '@alt-javascript/camel-lite-core';
import DirectEndpoint from './DirectEndpoint.js';

class DirectComponent extends Component {
  createEndpoint(uri, remaining, parameters, context) {
    return new DirectEndpoint(uri, context);
  }
}

export { DirectComponent };
export default DirectComponent;
