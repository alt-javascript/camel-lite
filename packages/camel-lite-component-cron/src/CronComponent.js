import { Component } from '@alt-javascript/camel-lite-core';
import CronEndpoint from './CronEndpoint.js';

class CronComponent extends Component {
  createEndpoint(uri, remaining, parameters, context) {
    return new CronEndpoint(uri, remaining, parameters, context);
  }
}

export { CronComponent };
export default CronComponent;
