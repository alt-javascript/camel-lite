import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite factory using Node's built-in node:sqlite module (Node 22.5+).
 * No native compile required — uses V8's built-in SQLite support.
 *
 * Note: node:sqlite is marked experimental in Node 22/24 but is stable enough
 * for our use case. No external dependency needed.
 */

/**
 * Open an in-memory or file-based SQLite database.
 * @param {string} path  - ':memory:' or a file path
 * @returns {import('node:sqlite').DatabaseSync}
 */
export function openDatabase(path = ':memory:') {
  return new DatabaseSync(path);
}

export { DatabaseSync };
