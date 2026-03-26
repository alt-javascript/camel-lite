class MammalContext {
  #components = new Map();
  #routes = new Map();
  #started = false;

  addComponent(scheme, component) {
    this.#components.set(scheme, component);
    return this;
  }

  getComponent(scheme) {
    return this.#components.get(scheme);
  }

  addRoutes(builder) {
    if (typeof builder.configure === 'function') {
      builder.configure(this);
    }
    for (const routeDef of builder.getRoutes()) {
      const pipeline = routeDef.compile();
      this.#routes.set(routeDef.fromUri, pipeline);
    }
    return this;
  }

  getRoute(uri) {
    return this.#routes.get(uri);
  }

  async start() {
    this.#started = true;
  }

  async stop() {
    this.#started = false;
  }

  get started() {
    return this.#started;
  }
}

export { MammalContext };
export default MammalContext;
