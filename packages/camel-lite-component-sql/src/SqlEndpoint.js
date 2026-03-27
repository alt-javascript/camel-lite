import { Endpoint } from '@alt-javascript/camel-lite-core';
import { SqlProducer } from './SqlProducer.js';
import { SqlConsumer } from './SqlConsumer.js';

/**
 * SqlEndpoint holds the parsed URI state for a sql: endpoint.
 *
 * URI format:
 *   sql:datasourceName?query=SELECT+*+FROM+users&outputType=rows&dialect=sqlite
 *
 * outputType: 'rows'     (default) → sets exchange.in.body = array of row objects
 *             'rowCount' → sets exchange.in.body = { rowCount: N }
 * dialect:    'sqlite' (default) | 'pg' | 'mysql2' | 'named'
 */
class SqlEndpoint extends Endpoint {
  #uri;
  #datasourceName;
  #query;
  #outputType;
  #dialect;
  #context;
  #component;

  constructor(uri, datasourceName, query, outputType, dialect, context, component) {
    super();
    this.#uri = uri;
    this.#datasourceName = datasourceName;
    this.#query = query;
    this.#outputType = outputType;
    this.#dialect = dialect;
    this.#context = context;
    this.#component = component;
  }

  get uri() { return this.#uri; }
  get datasourceName() { return this.#datasourceName; }
  get query() { return this.#query; }
  get outputType() { return this.#outputType; }
  get dialect() { return this.#dialect; }
  get context() { return this.#context; }
  get component() { return this.#component; }

  createProducer() {
    return new SqlProducer(this);
  }

  createConsumer(pipeline) {
    return new SqlConsumer(this, pipeline);
  }
}

export { SqlEndpoint };
export default SqlEndpoint;
