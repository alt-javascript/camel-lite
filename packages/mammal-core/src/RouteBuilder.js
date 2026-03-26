import { RouteDefinition } from './RouteDefinition.js';

class RouteBuilder {
  #routes = [];

  from(uri) {
    const routeDef = new RouteDefinition(uri);
    this.#routes.push(routeDef);
    return routeDef;
  }

  getRoutes() {
    return [...this.#routes];
  }

  // Default no-op; subclasses override to define routes using this.from(...)
  configure(context) {} // eslint-disable-line no-unused-vars
}

export { RouteBuilder };
export default RouteBuilder;
