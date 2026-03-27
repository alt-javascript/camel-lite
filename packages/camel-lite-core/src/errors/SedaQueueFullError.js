import { CamelError } from '../errors/CamelError.js';

class SedaQueueFullError extends CamelError {
  constructor(maxSize) {
    super(`SEDA queue is full (maxSize: ${maxSize})`);
    this.name = 'SedaQueueFullError';
    this.maxSize = maxSize;
  }
}

export { SedaQueueFullError };
export default SedaQueueFullError;
