import { Component } from 'mammal-core';
import LogEndpoint from './LogEndpoint.js';

class LogComponent extends Component {
  createEndpoint(uri, remaining, parameters, context) {
    return new LogEndpoint(uri);
  }
}

export { LogComponent };
export default LogComponent;
