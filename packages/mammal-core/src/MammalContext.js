class MammalContext {
  #components = new Map();
  #routes = new Map();
  #routeDefinitions = new Map();
  #consumers = new Map();
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
      // Eager compile (no context) — preserves existing getRoute() behaviour
      const pipeline = routeDef.compile();
      this.#routes.set(routeDef.fromUri, pipeline);
      // Also store the RouteDefinition for context-aware start()
      this.#routeDefinitions.set(routeDef.fromUri, routeDef);
    }
    return this;
  }

  getRoute(uri) {
    return this.#routes.get(uri);
  }

  registerConsumer(uri, consumer) {
    this.#consumers.set(uri, consumer);
  }

  getConsumer(uri) {
    return this.#consumers.get(uri);
  }

  async start() {
    for (const [fromUri, routeDef] of this.#routeDefinitions) {
      const colonIdx = fromUri.indexOf(':');
      const scheme = colonIdx >= 0 ? fromUri.slice(0, colonIdx) : fromUri;
      const rest = colonIdx >= 0 ? fromUri.slice(colonIdx + 1) : '';
      const qIdx = rest.indexOf('?');
      const remaining = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
      const params = qIdx >= 0
        ? new URLSearchParams(rest.slice(qIdx + 1))
        : new URLSearchParams();

      const component = this.getComponent(scheme);
      if (!component) {
        // No component registered for this scheme — skip silently
        continue;
      }

      const compiledPipeline = routeDef.compile(this);
      const endpoint = component.createEndpoint(fromUri, remaining, params, this);
      const consumer = endpoint.createConsumer(compiledPipeline);
      this.#consumers.set(fromUri, consumer);
      await consumer.start();
    }

    this.#started = true;
  }

  async stop() {
    for (const consumer of this.#consumers.values()) {
      await consumer.stop();
    }
    this.#consumers.clear();
    this.#started = false;
  }

  get started() {
    return this.#started;
  }
}

export { MammalContext };
export default MammalContext;
