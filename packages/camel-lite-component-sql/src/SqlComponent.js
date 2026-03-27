import { Component } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { SqlEndpoint } from './SqlEndpoint.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/SqlComponent');

/**
 * SqlComponent — executes SQL queries as a pipeline step.
 *
 * Datasource resolution (three-step chain, evaluated at send() time):
 *
 *   1. Component-internal map  — setDatasource(name, factory) takes priority.
 *      Name comes from: ?datasource= URI param, then the sql: path segment.
 *
 *   2. Context bean by name    — context.getBean(name) is checked when the
 *      component map has no match. The bean is the datasource object directly
 *      (not a factory wrapper).
 *
 *   3. Auto-select             — when no explicit name is given (or the named
 *      lookup found nothing) and context.getBeans() has exactly one entry,
 *      that bean is used automatically.
 *
 * setDatasource() registers a factory (zero-arg fn → db connection/pool).
 * Context beans are registered directly: context.registerBean('myDb', db).
 *
 * URI formats (all equivalent):
 *   sql:myDsName?query=SELECT+1&dialect=sqlite          ← path segment as ds name
 *   sql:?datasource=myDsBean&query=SELECT+1             ← explicit param (overrides path)
 *   sql:?query=SELECT+1&dialect=sqlite                  ← auto-select when 1 bean in ctx
 *
 * Supported driver shapes (communicated via 'dialect' URI param, default 'sqlite'):
 *   'sqlite'  → node:sqlite (DatabaseSync) — synchronous
 *   'pg'      → pg Pool — async: pool.query(sql, values)
 *   'mysql2'  → mysql2 Pool — async: pool.query(sql, values)
 *   'named'   → node:sqlite with pass-through named params
 */
class SqlComponent extends Component {
  #datasources = new Map();   // name → factory function (explicit component-level registration)
  #endpoints = new Map();

  /**
   * Register a named datasource factory on the component.
   * This takes priority over context bean lookup.
   * @param {string} name
   * @param {function} factory  - () => db/pool connection
   */
  setDatasource(name, factory) {
    this.#datasources.set(name, factory);
    log.info(`SqlComponent: datasource '${name}' registered on component`);
    return this;
  }

  /**
   * Resolve a datasource connection using the three-step chain.
   * @param {string|null} name      - bean/datasource name, or null for auto-select
   * @param {CamelContext|null} context
   * @returns {*} the database connection/pool
   */
  getDatasource(name, context = null) {
    // Step 1: component-internal map
    if (name && this.#datasources.has(name)) {
      log.debug(`SqlComponent: datasource '${name}' resolved from component map`);
      return this.#datasources.get(name)();
    }

    if (context) {
      // Step 2: context bean by name
      if (name) {
        const bean = context.getBean(name);
        if (bean != null) {
          log.debug(`SqlComponent: datasource '${name}' resolved from context bean`);
          return bean;
        }
      }

      // Step 3: single-bean auto-select
      const allBeans = context.getBeans();
      if (allBeans.length === 1) {
        log.debug(`SqlComponent: datasource auto-selected (single bean in context: '${allBeans[0][0]}')`);
        return allBeans[0][1];
      }
    }

    throw new Error(
      `SqlComponent: cannot resolve datasource '${name ?? '(none)'}'. ` +
      `Register via component.setDatasource(), context.registerBean(), ` +
      `or ensure exactly one bean is registered in context.`
    );
  }

  createEndpoint(uri, remaining, parameters, context) {
    if (this.#endpoints.has(uri)) {
      return this.#endpoints.get(uri);
    }

    // ?datasource= param takes priority over the path segment as the ds name.
    // Either may be absent — null triggers auto-select at send() time.
    const pathName = remaining.replace(/^\/+/, '') || null;
    const datasourceName = parameters.get('datasource') ?? pathName;

    const query = parameters.get('query') ?? '';
    const outputType = parameters.get('outputType') ?? 'rows';
    const dialect = parameters.get('dialect') ?? 'sqlite';

    if (!query) {
      throw new Error(`SqlEndpoint: 'query' parameter is required on URI: ${uri}`);
    }

    log.info(`SqlComponent creating endpoint: ds=${datasourceName ?? '(auto)'}, dialect=${dialect}, outputType=${outputType}`);

    const endpoint = new SqlEndpoint(uri, datasourceName, query, outputType, dialect, context, this);
    this.#endpoints.set(uri, endpoint);
    return endpoint;
  }
}

export { SqlComponent };
export default SqlComponent;
