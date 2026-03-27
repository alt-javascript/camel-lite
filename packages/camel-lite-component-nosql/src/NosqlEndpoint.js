import { Endpoint } from '@alt-javascript/camel-lite-core';
import { NosqlProducer } from './NosqlProducer.js';
import { NosqlConsumer } from './NosqlConsumer.js';

/**
 * NosqlEndpoint holds the parsed URI state for a nosql: endpoint.
 */
class NosqlEndpoint extends Endpoint {
  #uri;
  #collection;
  #datasource;
  #operation;
  #context;
  #component;

  constructor(uri, collection, datasource, operation, context, component) {
    super();
    this.#uri = uri;
    this.#collection = collection;
    this.#datasource = datasource;
    this.#operation = operation;
    this.#context = context;
    this.#component = component;
  }

  get uri() { return this.#uri; }
  get collection() { return this.#collection; }
  get datasource() { return this.#datasource; }
  get operation() { return this.#operation; }
  get context() { return this.#context; }
  get component() { return this.#component; }

  createProducer() {
    return new NosqlProducer(this);
  }

  createConsumer(pipeline) {
    return new NosqlConsumer(this, pipeline);
  }
}

export { NosqlEndpoint };
export default NosqlEndpoint;
