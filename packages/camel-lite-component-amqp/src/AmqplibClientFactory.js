import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/**
 * ESM/CJS bridge for amqplib (AMQP 0-9-1).
 * Single point of CJS import — keeps the rest of the package pure ESM.
 */
let _amqplib;

export function getAmqplib() {
  if (!_amqplib) {
    _amqplib = require('amqplib');
  }
  return _amqplib;
}

/**
 * @param {string} url - amqp://user:pass@host:port/vhost
 * @returns {Promise<import('amqplib').Connection>}
 */
export async function connect(url) {
  return getAmqplib().connect(url);
}
