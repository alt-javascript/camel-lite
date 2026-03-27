import { LoggerFactory } from '@alt-javascript/logger';
import { CamelContext } from '@alt-javascript/camel-lite-core';
import { registerAllComponents } from './components.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/cli/CamelRuntime');

/**
 * CamelRuntime — testable core of the CLI.
 * Separates context lifecycle and routing logic from the bin entry point.
 */
class CamelRuntime {
  #context = null;

  /**
   * Build a CamelContext with all bundled components registered and routes loaded.
   * @param {import('@alt-javascript/camel-lite-core').RouteBuilder} routeBuilder
   * @returns {Promise<CamelContext>}
   */
  async createContext(routeBuilder) {
    const ctx = new CamelContext();
    await registerAllComponents(ctx);
    ctx.addRoutes(routeBuilder);
    this.#context = ctx;
    return ctx;
  }

  /**
   * Start the context.
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.#context) throw new Error('CamelRuntime: call createContext() before start()');
    log.info('CamelRuntime: starting context');
    await this.#context.start();
  }

  /**
   * Stop the context.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.#context) return;
    log.info('CamelRuntime: stopping context');
    await this.#context.stop();
  }

  get context() {
    return this.#context;
  }
}

export { CamelRuntime };
export default CamelRuntime;
