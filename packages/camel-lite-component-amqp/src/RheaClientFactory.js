import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/**
 * ESM/CJS bridge for rhea (AMQP 1.0).
 * Single point of CJS import — keeps the rest of the package pure ESM.
 */
let _rhea;

export function getRhea() {
  if (!_rhea) {
    _rhea = require('rhea');
  }
  return _rhea;
}

export function createContainer() {
  return getRhea().create_container();
}
