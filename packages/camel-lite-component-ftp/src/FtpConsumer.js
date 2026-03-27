import { Consumer, Exchange } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { Writable } from 'node:stream';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/FtpConsumer');

class FtpConsumer extends Consumer {
  #uri;
  #context;
  #host;
  #port;
  #user;
  #password;
  #remotePath;
  #clientFactory;

  constructor(uri, context, host, port, user, password, remotePath, clientFactory) {
    super();
    this.#uri = uri;
    this.#context = context;
    this.#host = host;
    this.#port = port;
    this.#user = user;
    this.#password = password;
    this.#remotePath = remotePath;
    this.#clientFactory = clientFactory;
  }

  get uri() { return this.#uri; }

  async start() {
    this.#context.registerConsumer(this.#uri, this);
    log.info(`FTP consumer started: ${this.#host}${this.#remotePath}`);
  }

  async stop() {
    this.#context.registerConsumer(this.#uri, null);
    log.info(`FTP consumer stopped: ${this.#host}${this.#remotePath}`);
  }

  /**
   * One-shot poll: list remote directory, download each file into an Exchange.
   * Returns an array of Exchange objects, one per remote file.
   */
  async poll() {
    const client = this.#clientFactory();
    try {
      await client.access({
        host: this.#host,
        port: this.#port,
        user: this.#user,
        password: this.#password,
        secure: false,
      });
      log.info(`FTP poll connected: ${this.#host}${this.#remotePath}`);

      const list = await client.list(this.#remotePath);
      const files = list.filter(item => item.isFile);
      log.debug(`FTP poll found ${files.length} files in ${this.#remotePath}`);

      const exchanges = [];
      for (const file of files) {
        const remoteName = this.#remotePath.replace(/\/$/, '') + '/' + file.name;
        const chunks = [];
        const writable = new Writable({
          write(chunk, _, cb) { chunks.push(chunk); cb(); },
        });
        await client.downloadTo(writable, remoteName);
        log.debug(`FTP downloaded: ${remoteName}`);

        const exchange = new Exchange();
        exchange.in.body = Buffer.concat(chunks).toString('utf8');
        exchange.in.setHeader('CamelFileName', file.name);
        exchange.in.setHeader('CamelFtpRemotePath', remoteName);
        exchanges.push(exchange);
      }

      return exchanges;
    } finally {
      client.close();
      log.info(`FTP poll disconnected: ${this.#host}`);
    }
  }
}

export { FtpConsumer };
export default FtpConsumer;
