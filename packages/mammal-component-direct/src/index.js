import { Component } from 'mammal-core';

class DirectComponent extends Component {
  createEndpoint(uri, remaining, parameters, context) {
    throw new Error('DirectComponent not yet implemented');
  }
}

export { DirectComponent };
export default DirectComponent;
