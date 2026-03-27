import { Producer } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { Readable } from 'node:stream';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/FtpProducer');

class FtpProducer extends Producer {
  #host;
  #port;
  #user;
  #password;
  #remotePath;
  #clientFactory;

  constructor(host, port, user, password, remotePath, clientFactory) {
    super();
    this.#host = host;
    this.#port = port;
    this.#user = user;
    this.#password = password;
    this.#remotePath = remotePath;
    this.#clientFactory = clientFactory;
  }

  get host() { return this.#host; }
  get remotePath() { return this.#remotePath; }

  async send(exchange) {
    const client = this.#clientFactory();
    try {
      await client.access({
        host: this.#host,
        port: this.#port,
        user: this.#user,
        password: this.#password,
        secure: false,
      });
      log.info(`FTP connected: ${this.#host}:${this.#port}`);

      const body = exchange.in.body ?? '';
      const content = typeof body === 'string' ? body : JSON.stringify(body);
      const stream = Readable.from([content]);

      // File name: CamelFileName header > remotePath (treated as full remote path)
      const remoteName = exchange.in.getHeader('CamelFtpRemotePath')
        ?? exchange.in.getHeader('CamelFileName')
        ?? this.#remotePath;

      await client.uploadFrom(stream, remoteName);
      log.debug(`FTP uploaded: ${remoteName}`);

      exchange.out.setHeader('CamelFtpRemotePath', remoteName);
    } finally {
      client.close();
      log.info(`FTP disconnected: ${this.#host}`);
    }
  }
}

export { FtpProducer };
export default FtpProducer;
