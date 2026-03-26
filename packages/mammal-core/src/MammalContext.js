class MammalContext {
  #components = new Map();
  #started = false;

  addComponent(scheme, component) {
    this.#components.set(scheme, component);
    return this;
  }

  getComponent(scheme) {
    return this.#components.get(scheme);
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
