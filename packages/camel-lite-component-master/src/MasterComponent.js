import { Component } from '@alt-javascript/camel-lite-core';
import MasterEndpoint from './MasterEndpoint.js';

class MasterComponent extends Component {
  createEndpoint(uri, remaining, parameters, context) {
    return new MasterEndpoint(uri, remaining, parameters, context);
  }
}

export { MasterComponent };
export default MasterComponent;
