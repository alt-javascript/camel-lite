class Pipeline {
  #steps;

  constructor(steps = []) {
    this.#steps = steps;
  }

  async run(exchange) {
    try {
      for (const step of this.#steps) {
        const prevOutBody = exchange.out.body;
        await step(exchange);
        // Out→in promotion: if out.body was set (or changed), promote it to in
        if (exchange.out.body !== null && exchange.out.body !== prevOutBody) {
          exchange.in.body = exchange.out.body;
          // Copy out headers to in
          for (const [key, value] of exchange.out.headers) {
            exchange.in.setHeader(key, value);
          }
          // Reset out
          exchange.out.body = null;
          exchange.out.headers.clear();
        }
      }
    } catch (err) {
      exchange.exception = err;
    }
  }
}

export { Pipeline };
export default Pipeline;
