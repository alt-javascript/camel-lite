class Pipeline {
  #steps;
  #clauses;
  #maxAttempts;
  #redeliveryDelay;

  constructor(steps = [], options = {}) {
    this.#steps = steps;
    this.#clauses = options.clauses ?? [];
    this.#maxAttempts = options.maxAttempts ?? 0;
    this.#redeliveryDelay = options.redeliveryDelay ?? 0;
  }

  #sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async run(exchange) {
    for (const step of this.#steps) {
      const totalAttempts = this.#maxAttempts + 1;
      let attempt = 0;
      let lastErr;
      let succeeded = false;

      while (attempt < totalAttempts) {
        const prevOutBody = exchange.out.body;
        try {
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
          succeeded = true;
          break;
        } catch (err) {
          lastErr = err;
          attempt++;
          if (attempt < totalAttempts && this.#redeliveryDelay > 0) {
            await this.#sleep(this.#redeliveryDelay);
          }
        }
      }

      if (!succeeded) {
        exchange.exception = lastErr;
        const clause = this.#clauses.find(c => lastErr instanceof c.errorClass);
        if (clause) {
          await clause.processor(exchange);
          if (clause.handled === true) {
            exchange.exception = null;
          }
        }
        return;
      }
    }
  }
}

export { Pipeline };
export default Pipeline;
