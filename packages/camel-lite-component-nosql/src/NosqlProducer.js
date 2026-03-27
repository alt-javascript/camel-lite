import { Producer } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/NosqlProducer');

/**
 * NosqlProducer — executes a jsnosqlc Collection operation as a pipeline step.
 *
 * Operation dispatch (endpoint.operation):
 *
 *   get    — exchange.in.body = key (string)
 *            → exchange.in.body = document | null
 *
 *   store  — exchange.in.body = { key: string, doc: object }
 *            → exchange.in.body = undefined  (fire-and-forget upsert)
 *
 *   delete — exchange.in.body = key (string)
 *            → exchange.in.body = undefined
 *
 *   insert — exchange.in.body = document (object)
 *            → exchange.in.body = assigned key (string)
 *
 *   update — exchange.in.body = { key: string, patch: object }
 *            → exchange.in.body = undefined  (patch merge)
 *
 *   find   — exchange.in.body = Filter (built AST from Filter.where()...build())
 *            → exchange.in.body = document[]  (from cursor.getDocuments())
 */
class NosqlProducer extends Producer {
  #endpoint;

  constructor(endpoint) {
    super();
    this.#endpoint = endpoint;
  }

  async send(exchange) {
    const { collection: collectionName, datasource, operation, component, context } = this.#endpoint;

    log.debug(`NosqlProducer: ${operation} on ${datasource ?? '(auto)'}/${collectionName}`);

    const client = await component.getClient(datasource, context);
    const col = client.getCollection(collectionName);
    const body = exchange.in.body;

    switch (operation) {
      case 'get': {
        exchange.in.body = await col.get(body);
        break;
      }
      case 'store': {
        const { key, doc } = body ?? {};
        await col.store(key, doc);
        exchange.in.body = undefined;
        break;
      }
      case 'delete': {
        await col.delete(body);
        exchange.in.body = undefined;
        break;
      }
      case 'insert': {
        exchange.in.body = await col.insert(body);
        break;
      }
      case 'update': {
        const { key, patch } = body ?? {};
        await col.update(key, patch);
        exchange.in.body = undefined;
        break;
      }
      case 'find': {
        // body should be a built Filter AST from Filter.where()...build()
        // null/undefined body means find all — pass null to driver
        const cursor = await col.find(body ?? null);
        exchange.in.body = cursor.getDocuments();
        break;
      }
      default:
        throw new Error(`NosqlProducer: unknown operation '${operation}'`);
    }

    log.debug(`NosqlProducer: ${operation} complete on ${datasource}/${collectionName}`);
  }
}

export { NosqlProducer };
export default NosqlProducer;
