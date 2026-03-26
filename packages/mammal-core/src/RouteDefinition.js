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

  compile() {
    // Filter to processor-function nodes only; skip 'to' nodes (S03 concern)
    const processorFns = this.#nodes.filter((n) => typeof n === 'function');
    return new Pipeline(processorFns);
  }
}

export { RouteDefinition };
export default RouteDefinition;
