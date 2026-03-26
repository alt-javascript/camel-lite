import MammalError from './errors/MammalError.js';

function normalize(p) {
  if (typeof p === 'function') {
    return p;
  }
  if (p !== null && typeof p === 'object' && typeof p.process === 'function') {
    return (exchange) => p.process(exchange);
  }
  throw new MammalError('Invalid processor: must be a function or object with a process() method');
}

export { normalize };
export default { normalize };
