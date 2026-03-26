import { normalize } from './ProcessorNormalizer.js';
import { Pipeline } from './Pipeline.js';

class RouteDefinition {
  #fromUri;
  #nodes = [];

  constructor(fromUri) {
    this.#fromUri = fromUri;
  }

  process(p) {
    this.#nodes.push(normalize(p));
    return this;
  }

  to(uri) {
    this.#nodes.push({ type: 'to', uri });
    return this;
  }

  get fromUri() {
    return this.#fromUri;
  }

  getNodes() {
    return [...this.#nodes];
  }

  compile(context = null) {
    const steps = [];

    for (const node of this.#nodes) {
      if (typeof node === 'function') {
        steps.push(node);
      } else if (node && node.type === 'to') {
        if (context !== null) {
          // Capture uri at definition time; create dispatch step at runtime
          const { uri } = node;
          const dispatchStep = async (exchange) => {
            const colonIdx = uri.indexOf(':');
            const scheme = colonIdx >= 0 ? uri.slice(0, colonIdx) : uri;
            const rest = colonIdx >= 0 ? uri.slice(colonIdx + 1) : '';
            const qIdx = rest.indexOf('?');
            const remaining = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
            const params = qIdx >= 0
              ? new URLSearchParams(rest.slice(qIdx + 1))
              : new URLSearchParams();

            const component = context.getComponent(scheme);
            const endpoint = component.createEndpoint(uri, remaining, params, context);
            const producer = endpoint.createProducer();
            await producer.send(exchange);
          };
          steps.push(dispatchStep);
        }
        // When context is null, skip to() nodes (preserve existing behaviour)
      }
    }

    return new Pipeline(steps);
  }
}

export { RouteDefinition };
export default RouteDefinition;
