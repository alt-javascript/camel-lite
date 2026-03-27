import { open, unlink, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LoggerFactory } from '@alt-javascript/logger';
import { LockStrategy } from '../LockStrategy.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/master/FileLockStrategy');

class FileLockStrategy extends LockStrategy {
  #lockDir;

  constructor(options = {}) {
    super();
    this.#lockDir = options.lockDir ?? tmpdir();
  }

  #lockPath(serviceName) {
    return join(this.#lockDir, `${serviceName}.lock`);
  }

  async acquire(serviceName, nodeId) {
    const path = this.#lockPath(serviceName);

    // Ensure lock dir exists
    try {
      await mkdir(this.#lockDir, { recursive: true });
    } catch { /* already exists */ }

    // Try exclusive create
    try {
      const fh = await open(path, 'wx');
      await fh.writeFile(nodeId, 'utf8');
      await fh.close();
      log.debug(`FileLock acquired: ${path} by ${nodeId}`);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // File exists — check if we already own it (re-entrant)
      try {
        const existing = await readFile(path, 'utf8');
        if (existing.trim() === nodeId) {
          log.debug(`FileLock re-acquired (already owned): ${path}`);
          return true;
        }
      } catch { /* race: file was deleted between EEXIST and readFile — retry next poll */ }
      return false;
    }
  }

  async release(serviceName, nodeId) {
    const path = this.#lockPath(serviceName);
    try {
      const existing = await readFile(path, 'utf8');
      if (existing.trim() === nodeId) {
        await unlink(path);
        log.debug(`FileLock released: ${path}`);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // Already gone — fine
    }
  }

  async renew(serviceName, nodeId) {
    const path = this.#lockPath(serviceName);
    try {
      const existing = await readFile(path, 'utf8');
      return existing.trim() === nodeId;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  async close() {
    // No persistent connections to close for file backend
  }
}

export { FileLockStrategy };
export default FileLockStrategy;
