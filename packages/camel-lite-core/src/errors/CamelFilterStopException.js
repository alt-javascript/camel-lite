import { CamelError } from './CamelError.js';

/**
 * Thrown by filter() and aggregate() steps to halt routing cleanly.
 * Pipeline treats this as a non-error stop — exchange.exception is NOT set.
 */
class CamelFilterStopException extends CamelError {
  constructor(reason = 'filtered') {
    super(`Exchange stopped: ${reason}`);
    this.name = 'CamelFilterStopException';
  }
}

export { CamelFilterStopException };
export default CamelFilterStopException;
