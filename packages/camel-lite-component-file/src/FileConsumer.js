import { Consumer, Exchange } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { readdir, readFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/FileConsumer');

class FileConsumer extends Consumer {
  #uri;
  #context;
  #dir;
  #noop;

  constructor(uri, context, dir, noop = false) {
    super();
    this.#uri = uri;
    this.#context = context;
    this.#dir = dir;
    this.#noop = noop;
  }

  get uri() { return this.#uri; }

  async start() {
    this.#context.registerConsumer(this.#uri, this);
    log.info(`File consumer started: ${this.#dir}`);
  }

  async stop() {
    this.#context.registerConsumer(this.#uri, null);
    log.info(`File consumer stopped: ${this.#dir}`);
  }

  /**
   * One-shot poll: read all non-hidden files from the directory.
   * Returns an array of Exchange objects, one per file.
   * Files are moved to dir/.done/ after reading unless noop=true.
   */
  async poll() {
    log.info(`Polling: ${this.#dir}`);

    let entries;
    try {
      entries = await readdir(this.#dir, { withFileTypes: true });
    } catch {
      // Directory does not exist yet — return empty
      return [];
    }

    const files = entries.filter(
      e => e.isFile() && !e.name.startsWith('.')
    );

    const exchanges = [];

    for (const file of files) {
      const filePath = join(this.#dir, file.name);
      const content = await readFile(filePath, 'utf8');
      log.debug(`Read: ${file.name}`);

      const exchange = new Exchange();
      exchange.in.body = content;
      exchange.in.setHeader('CamelFileName', file.name);
      exchange.in.setHeader('CamelFilePath', filePath);

      if (!this.#noop) {
        const doneDir = join(this.#dir, '.done');
        await mkdir(doneDir, { recursive: true });
        await rename(filePath, join(doneDir, file.name));
        log.debug(`Moved to .done: ${file.name}`);
      }

      exchanges.push(exchange);
    }

    return exchanges;
  }
}

export { FileConsumer };
export default FileConsumer;
