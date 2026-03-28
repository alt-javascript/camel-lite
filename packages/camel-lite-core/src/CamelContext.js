import { LoggerFactory } from '@alt-javascript/logger';
import { PollingConsumerAdapter } from './PollingConsumerAdapter.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/CamelContext');

class CamelContext {
  #components = new Map();
  #routes = new Map();
  #routeDefinitions = new Map();
  #consumers = new Map();
  #beans = new Map();
  #started = false;
  #abortController = null;
  #pollingUris = new Set();

  /**
   * Register a named bean in the context.
   * Beans are arbitrary objects (datasources, clients, configuration, etc.)
   * that components can look up by name rather than requiring direct injection.
   * @param {string} name
   * @param {*} bean
   * @returns {CamelContext} this (fluent)
   */
  registerBean(name, bean) {
    this.#beans.set(name, bean);
    return this;
  }

  /**
   * Retrieve a named bean from the context.
   * @param {string} name
   * @returns {*} the bean, or undefined if not found
   */
  getBean(name) {
    return this.#beans.get(name);
  }

  /**
   * Return all registered beans as an array of [name, bean] pairs.
   * @returns {Array<[string, *]>}
   */
  getBeans() {
    return Array.from(this.#beans.entries());
  }

  /**
   * Declare which consumer URIs should be wrapped with a PollingConsumerAdapter
   * so they can be polled via ConsumerTemplate.  Must be set before start().
   * @param {Set<string>|Iterable<string>} uriSet
   */
  set pollingUris(uriSet) {
    this.#pollingUris = uriSet instanceof Set ? uriSet : new Set(uriSet);
  }

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
    this.#abortController = new AbortController();
    const signal = this.#abortController.signal;

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
        log.warn(`No component registered for scheme: ${scheme} — route ${fromUri} will not be started`);
        continue;
      }

      const compiledPipeline = routeDef.compile(this, { signal });
      const endpoint = component.createEndpoint(fromUri, remaining, params, this);

      let consumerToRegister;
      if (this.#pollingUris.has(fromUri)) {
        // Wrap the real consumer with a PollingConsumerAdapter so ConsumerTemplate
        // can poll it via the BufferQueue.
        const adapter = new PollingConsumerAdapter();
        const capPipeline = adapter.capturedPipeline;
        const realConsumer = endpoint.createConsumer(capPipeline);
        adapter.setConsumer(realConsumer);
        consumerToRegister = adapter;
      } else {
        consumerToRegister = endpoint.createConsumer(compiledPipeline);
      }

      this.#consumers.set(fromUri, consumerToRegister);
      await consumerToRegister.start();
      // For polling URIs, the real consumer's start() calls registerConsumer(uri, self),
      // which overwrites the adapter.  Re-register the adapter so getConsumer() returns it.
      if (this.#pollingUris.has(fromUri)) {
        this.#consumers.set(fromUri, consumerToRegister);
      }
    }

    log.info('Apache Camel Lite started');
    this.#started = true;
  }

  async stop() {
    // Signal abort — cancels any in-flight redelivery sleeps
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }

    for (const consumer of this.#consumers.values()) {
      await consumer.stop();
    }
    this.#consumers.clear();
    this.#started = false;
    log.info('Apache Camel Lite stopped');
  }

  get started() {
    return this.#started;
  }
}

export { CamelContext };
export default CamelContext;
