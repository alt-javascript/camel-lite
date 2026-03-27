import { Producer } from '@alt-javascript/camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/FileProducer');

class FileProducer extends Producer {
  #dir;
  #fileName;

  constructor(dir, fileName = null) {
    super();
    this.#dir = dir;
    this.#fileName = fileName;
  }

  get dir() { return this.#dir; }
  get fileName() { return this.#fileName; }

  async send(exchange) {
    // Resolve file name: CamelFileName header > constructor param > messageId.txt
    const name = exchange.in.getHeader('CamelFileName')
      ?? this.#fileName
      ?? (exchange.in.messageId + '.txt');

    const filePath = join(this.#dir, name);
    await mkdir(this.#dir, { recursive: true });

    const body = exchange.in.body ?? '';
    const content = typeof body === 'string' ? body : JSON.stringify(body);

    await writeFile(filePath, content, 'utf8');
    log.info(`Written: ${filePath}`);

    // Inform downstream steps of the written path
    exchange.out.setHeader('CamelFileName', name);
    exchange.out.setHeader('CamelFilePath', filePath);
  }
}

export { FileProducer };
export default FileProducer;
