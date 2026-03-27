import { LoggerFactory } from '@alt-javascript/logger';
import { CamelFilterStopException } from './errors/CamelFilterStopException.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/Pipeline');

class Pipeline {
  #steps;
  #clauses;
  #maxAttempts;
  #redeliveryDelay;
  #signal;

  constructor(steps = [], options = {}) {
    this.#steps = steps;
    this.#clauses = options.clauses ?? [];
    this.#maxAttempts = options.maxAttempts ?? 0;
    this.#redeliveryDelay = options.redeliveryDelay ?? 0;
    this.#signal = options.signal ?? null;
  }

  #sleep(ms) {
    const signal = this.#signal;
    if (signal && signal.aborted) {
      log.debug('Redelivery sleep cancelled (signal already aborted)');
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          log.debug('Redelivery sleep cancelled');
          resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
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
          log.debug(`Step completed for exchange ${exchange.in.messageId}`);
          succeeded = true;
          break;
        } catch (err) {
          if (err instanceof CamelFilterStopException) {
            // Clean stop — filter() or aggregate() held this exchange
            log.debug(`Exchange ${exchange.in.messageId} stopped cleanly: ${err.message}`);
            return;
          }
          lastErr = err;
          attempt++;
          if (attempt < totalAttempts && this.#redeliveryDelay > 0) {
            await this.#sleep(this.#redeliveryDelay);
          }
        }
      }

      if (!succeeded) {
        log.error(`Error processing exchange ${exchange.in.messageId}: ${lastErr.message}`);
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
