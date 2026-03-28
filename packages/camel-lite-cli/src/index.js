/**
 * CdiCamelRuntime — CDI-backed camel-lite runtime for the CLI.
 *
 * Replaces the old CamelRuntime that manually registered components via
 * components.js.  Now uses camelLiteExtrasStarter (which bundles
 * boot-camel-lite-starter + boot-camel-lite-extras-starter) to boot a full
 * CDI ApplicationContext with all components wired automatically.
 *
 * ALL imports of CDI / starter packages are performed dynamically inside
 * boot() so that module-level LoggerFactory.getLogger() calls in those
 * packages do not fire before the boot layer has set the log level.
 *
 * Public API (matches the old CamelRuntime contract expected by tests):
 *
 *   const runtime = new CdiCamelRuntime(routeBuilder?, config?);
 *   // OR
 *   const ctx = await runtime.createContext(routeBuilder);   // accepts builder at call-time too
 *   await runtime.start();
 *   await runtime.stop();
 *   runtime.context   // → underlying CamelContext
 *
 * Named export CamelRuntime is kept as an alias for backward test compatibility.
 */

class CdiCamelRuntime {
  #routeBuilder = null;
  #config = null;
  #applicationContext = null;
  #camelLiteContextBean = null;

  /**
   * @param {object} [routeBuilder] - optional at construction; may also be supplied to createContext()
   * @param {object} [config]       - optional config POJO or IConfig instance
   */
  constructor(routeBuilder, config) {
    this.#routeBuilder = routeBuilder ?? null;
    this.#config = config ?? null;
  }

  /**
   * Boot the CDI ApplicationContext and wire the CamelContext.
   * Accepts routeBuilder at call-time (overrides constructor arg) for
   * backward compatibility with tests that call createContext(builder).
   *
   * @param {object} [routeBuilder] - optional override
   * @returns {Promise<import('@alt-javascript/camel-lite-core').CamelContext>}
   */
  async createContext(routeBuilder) {
    if (routeBuilder) this.#routeBuilder = routeBuilder;
    if (!this.#routeBuilder) {
      throw new Error('CdiCamelRuntime: a routeBuilder must be supplied either to the constructor or to createContext()');
    }
    await this.#boot();
    return this.context;
  }

  /**
   * Start the underlying CamelContext (idempotent if createContext already started it).
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.#applicationContext) {
      throw new Error('CdiCamelRuntime: call createContext() before start()');
    }
    // The CDI ApplicationContext.start() already started CamelLiteContext.init()
    // which fires CamelContext.start() asynchronously.  We just wait for it to
    // be fully ready here.
    await this.#camelLiteContextBean.ready();
  }

  /**
   * Stop the underlying CamelContext and destroy the CDI ApplicationContext.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.#applicationContext) return;
    await this.#camelLiteContextBean.destroy();
    // ApplicationContext does not expose a stop(); destroy() on the Camel bean is sufficient.
    this.#applicationContext = null;
    this.#camelLiteContextBean = null;
  }

  /**
   * The underlying CamelContext instance (available after createContext()).
   * @returns {import('@alt-javascript/camel-lite-core').CamelContext | null}
   */
  get context() {
    return this.#camelLiteContextBean?.camelContext ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private boot method — ALL CDI/starter imports are dynamic here so that
  // module-level LoggerFactory calls in those packages do not fire before the
  // boot layer sets the log level.
  // ---------------------------------------------------------------------------

  async #boot() {
    // Dynamic imports — must stay inside this async method
    const { camelLiteExtrasStarter } = await import('@alt-javascript/boot-camel-lite-extras-starter');
    const { Context, Singleton } = await import('@alt-javascript/cdi');

    // Wrap the routeBuilder as a CDI singleton so RouteRegistry.applyRoutes()
    // discovers it via the bean.configure() check.
    const builder = this.#routeBuilder;
    class CliRouteBuilder {
      configure(camelContext) {
        if (typeof builder.configure === 'function') builder.configure(camelContext);
      }
      getRoutes() {
        return builder.getRoutes();
      }
    }

    const userContext = new Context([
      new Singleton({ Reference: CliRouteBuilder, name: 'cliRouteBuilder' }),
    ]);

    const { applicationContext } = await camelLiteExtrasStarter({
      contexts: [userContext],
      config: this.#config ?? {},
    });

    this.#applicationContext = applicationContext;
    this.#camelLiteContextBean = applicationContext.get('camelLiteContext');
  }
}

// Backward-compat alias — tests import { CamelRuntime }
const CamelRuntime = CdiCamelRuntime;

export { CdiCamelRuntime, CamelRuntime };
export default CdiCamelRuntime;
