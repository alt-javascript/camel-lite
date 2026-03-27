import { Endpoint, CamelError } from 'camel-lite-core';
import { randomUUID } from 'node:crypto';
import MasterConsumer from './MasterConsumer.js';

class MasterEndpoint extends Endpoint {
  #uri;
  #service;
  #backend;
  #lockOptions;
  #renewInterval;
  #pollInterval;
  #nodeId;
  #context;

  constructor(uri, remaining, parameters, context) {
    super();
    this.#uri = uri;
    this.#context = context;

    const service = remaining;
    if (!service) throw new CamelError(`master: URI missing service name: ${uri}`);
    this.#service = service;

    const params = parameters instanceof URLSearchParams
      ? parameters
      : new URLSearchParams(typeof parameters === 'string' ? parameters : '');

    this.#backend = params.get('backend') ?? 'file';

    // Validate backend at construction time
    if (!['file', 'zookeeper', 'consul'].includes(this.#backend)) {
      throw new CamelError(`master: unknown backend '${this.#backend}'. Supported: file, zookeeper, consul`);
    }

    this.#nodeId = params.get('nodeId') ?? randomUUID();

    const rawRenew = params.get('renewInterval');
    const rawPoll = params.get('pollInterval');
    this.#renewInterval = rawRenew !== null ? Math.max(500, parseInt(rawRenew, 10) || 5000) : 5000;
    this.#pollInterval = rawPoll !== null ? Math.max(200, parseInt(rawPoll, 10) || 2000) : 2000;

    // Backend-specific options passed through to strategy constructor
    this.#lockOptions = {
      // file backend
      lockDir: params.get('lockDir') ?? undefined,
      // zookeeper backend
      hosts: params.get('hosts') ?? 'localhost:2181',
      sessionTimeout: params.get('sessionTimeout') ? parseInt(params.get('sessionTimeout'), 10) : 30000,
      // consul backend
      host: params.get('host') ?? 'localhost',
      port: params.get('port') ? parseInt(params.get('port'), 10) : 8500,
      ttl: params.get('ttl') ?? '15s',
      requestTimeout: params.get('requestTimeout') ? parseInt(params.get('requestTimeout'), 10) : 5000,
    };
  }

  get uri() { return this.#uri; }
  get service() { return this.#service; }
  get backend() { return this.#backend; }
  get nodeId() { return this.#nodeId; }
  get renewInterval() { return this.#renewInterval; }
  get pollInterval() { return this.#pollInterval; }
  get lockOptions() { return this.#lockOptions; }

  createConsumer(pipeline) {
    return new MasterConsumer(
      this.#uri, this.#service, this.#backend, this.#nodeId,
      this.#renewInterval, this.#pollInterval, this.#lockOptions,
      this.#context, pipeline
    );
  }
}

export { MasterEndpoint };
export default MasterEndpoint;
