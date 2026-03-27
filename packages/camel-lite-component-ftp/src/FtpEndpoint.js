import { Endpoint } from 'camel-lite-core';
import FtpProducer from './FtpProducer.js';
import FtpConsumer from './FtpConsumer.js';
import { createFtpClient } from './FtpClientFactory.js';

class FtpEndpoint extends Endpoint {
  #uri;
  #host;
  #port;
  #user;
  #password;
  #remotePath;
  #binary;
  #context;

  constructor(uri, remaining, parameters, context) {
    super();
    this.#uri = uri;
    this.#context = context;

    // FTP URIs: ftp://user:pass@host:21/remote/path
    // The raw uri from CamelContext has scheme 'ftp', so we reconstruct a URL:
    // 'ftp:user:pass@host:21/path' → need to rebuild as 'ftp://user:pass@host:21/path'
    // Use URL class — it handles authority (user:pass@host:port) correctly.
    // remaining = everything after 'ftp:' stripped of leading '//'
    let fullUri = uri;
    if (!fullUri.startsWith('ftp://') && !fullUri.startsWith('ftps://')) {
      // Camel-style: ftp:host/path or ftp:user:pass@host:21/path
      fullUri = fullUri.replace(/^ftp:/, 'ftp://');
    }

    try {
      const parsed = new URL(fullUri);
      this.#host = parsed.hostname || 'localhost';
      this.#port = parseInt(parsed.port || '21', 10);
      this.#user = decodeURIComponent(parsed.username || 'anonymous');
      this.#password = decodeURIComponent(parsed.password || '');
      this.#remotePath = parsed.pathname || '/';
    } catch {
      // Fallback for unparseable URIs
      this.#host = 'localhost';
      this.#port = 21;
      this.#user = 'anonymous';
      this.#password = '';
      this.#remotePath = '/' + (remaining || '');
    }

    const params = parameters instanceof URLSearchParams
      ? parameters
      : new URLSearchParams(typeof parameters === 'string' ? parameters : '');

    this.#binary = params.get('binary') === 'true';
  }

  get uri() { return this.#uri; }
  get host() { return this.#host; }
  get port() { return this.#port; }
  get user() { return this.#user; }
  get password() { return this.#password; }
  get remotePath() { return this.#remotePath; }
  get binary() { return this.#binary; }

  createProducer(clientFactory = createFtpClient) {
    return new FtpProducer(this.#host, this.#port, this.#user, this.#password, this.#remotePath, clientFactory);
  }

  createConsumer(pipeline, clientFactory = createFtpClient) {
    return new FtpConsumer(this.#uri, this.#context, this.#host, this.#port, this.#user, this.#password, this.#remotePath, clientFactory);
  }
}

export { FtpEndpoint };
export default FtpEndpoint;
