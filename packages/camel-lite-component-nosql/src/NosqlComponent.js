import { Component } from '@alt-javascript/camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { NosqlEndpoint } from './NosqlEndpoint.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/NosqlComponent');

/**
 * NosqlComponent — executes NoSQL operations as a pipeline step via
 * the @alt-javascript/jsnosqlc abstraction layer.
 *
 * Datasource resolution (three-step chain, evaluated at send() time):
 *
 *   1. Component-internal map  — setDatasource(name, factory) takes priority.
 *
 *   2. Context bean by name    — context.getBean(name) is checked when the
 *      component map has no match. The bean may be a ClientDataSource
 *      (has .getClient()) or a jsnosqlc Client directly.
 *
 *   3. Auto-select             — when no explicit name is given (or named lookup
 *      found nothing) and context.getBeans() has exactly one entry, that bean
 *      is used automatically.
 *
 * URI formats:
 *   nosql:collection?datasource=myDsBean&operation=insert
 *   nosql:collection?operation=insert        ← auto-select when 1 bean in ctx
 *
 * Operations (jsnosqlc Collection API):
 *   get    — exchange.in.body = key (string)         → exchange.in.body = doc | null
 *   store  — exchange.in.body = { key, doc }         → exchange.in.body = undefined
 *   delete — exchange.in.body = key (string)         → exchange.in.body = undefined
 *   insert — exchange.in.body = doc (object)         → exchange.in.body = assigned key
 *   update — exchange.in.body = { key, patch }       → exchange.in.body = undefined
 *   find   — exchange.in.body = Filter (built AST)   → exchange.in.body = doc array
 */
class NosqlComponent extends Component {
  #datasources = new Map();   // name → factory function
  #clients = new Map();       // name → cached Client (from component-map factories)
  #endpoints = new Map();

  /**
   * Register a named datasource factory on the component.
   * Factory is () => ClientDataSource | Client (sync or async result).
   * @param {string} name
   * @param {function} factory
   */
  setDatasource(name, factory) {
    this.#datasources.set(name, factory);
    log.info(`NosqlComponent: datasource '${name}' registered on component`);
    return this;
  }

  /**
   * Resolve and return a jsnosqlc Client using the three-step chain.
   * Clients from the component-internal map are cached.
   * @param {string|null} name
   * @param {CamelContext|null} context
   * @returns {Promise<import('@alt-javascript/jsnosqlc-core').Client>}
   */
  async getClient(name, context = null) {
    // Step 1: component-internal map
    if (name && this.#datasources.has(name)) {
      if (this.#clients.has(name)) {
        return this.#clients.get(name);
      }
      log.debug(`NosqlComponent: datasource '${name}' resolved from component map`);
      const factoryResult = this.#datasources.get(name)();
      const client = typeof factoryResult.getClient === 'function'
        ? await factoryResult.getClient()
        : await factoryResult;
      this.#clients.set(name, client);
      log.info(`NosqlComponent: client acquired for datasource '${name}'`);
      return client;
    }

    if (context) {
      // Step 2: context bean by name
      if (name) {
        const bean = context.getBean(name);
        if (bean != null) {
          const cacheKey = `__ctx__:${name}`;
          if (this.#clients.has(cacheKey)) {
            return this.#clients.get(cacheKey);
          }
          log.debug(`NosqlComponent: datasource '${name}' resolved from context bean`);
          const client = typeof bean.getClient === 'function' ? await bean.getClient() : bean;
          this.#clients.set(cacheKey, client);
          return client;
        }
      }

      // Step 3: single-bean auto-select
      const allBeans = context.getBeans();
      if (allBeans.length === 1) {
        const [beanName, bean] = allBeans[0];
        const cacheKey = `__ctx__:${beanName}`;
        if (this.#clients.has(cacheKey)) {
          return this.#clients.get(cacheKey);
        }
        log.debug(`NosqlComponent: datasource auto-selected (single bean in context: '${beanName}')`);
        const client = typeof bean.getClient === 'function' ? await bean.getClient() : bean;
        this.#clients.set(cacheKey, client);
        return client;
      }
    }

    throw new Error(
      `NosqlComponent: cannot resolve datasource '${name ?? '(none)'}'. ` +
      `Register via component.setDatasource(), context.registerBean(), ` +
      `or ensure exactly one bean is registered in context.`
    );
  }

  /**
   * Close all cached clients from the component-internal map.
   */
  async close() {
    for (const [name, client] of this.#clients) {
      await client.close().catch(() => {});
      log.info(`NosqlComponent: client closed for datasource '${name}'`);
    }
    this.#clients.clear();
  }

  createEndpoint(uri, remaining, parameters, context) {
    if (this.#endpoints.has(uri)) {
      return this.#endpoints.get(uri);
    }

    const collection = remaining.replace(/^\/+/, '') || 'default';
    const datasource = parameters.get('datasource') ?? null;  // null = auto-select
    const operation = parameters.get('operation') ?? 'get';

    log.info(`NosqlComponent creating endpoint: collection=${collection}, datasource=${datasource ?? '(auto)'}, op=${operation}`);

    const endpoint = new NosqlEndpoint(uri, collection, datasource, operation, context, this);
    this.#endpoints.set(uri, endpoint);
    return endpoint;
  }
}

export { NosqlComponent };
export default NosqlComponent;
