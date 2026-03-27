import { Component } from '@alt-javascript/camel-lite-core';
import TimerEndpoint from './TimerEndpoint.js';

class TimerComponent extends Component {
  createEndpoint(uri, remaining, parameters, context) {
    return new TimerEndpoint(uri, remaining, parameters, context);
  }
}

export { TimerComponent };
export default TimerComponent;
