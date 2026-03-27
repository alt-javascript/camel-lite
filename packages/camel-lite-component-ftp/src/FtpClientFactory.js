import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const basicFtp = require('basic-ftp');

/**
 * ESM/CJS bridge for basic-ftp.
 * This is the single point where CJS is loaded — keeps the rest of the package pure ESM.
 */
export function createFtpClient() {
  return new basicFtp.Client();
}
