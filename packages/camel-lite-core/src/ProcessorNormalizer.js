import CamelError from './errors/CamelError.js';

function normalize(p) {
  if (typeof p === 'function') {
    return p;
  }
  if (p !== null && typeof p === 'object' && typeof p.process === 'function') {
    return (exchange) => p.process(exchange);
  }
  throw new CamelError('Invalid processor: must be a function or object with a process() method');
}

export { normalize };
export default { normalize };
