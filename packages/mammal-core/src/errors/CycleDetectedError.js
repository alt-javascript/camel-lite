import MammalError from '../errors/MammalError.js';

class CycleDetectedError extends MammalError {
  constructor(uri) {
    super(`Cycle detected: uri "${uri}" is already in the direct call stack`);
    this.name = 'CycleDetectedError';
    this.uri = uri;
  }
}

export { CycleDetectedError };
export default CycleDetectedError;
