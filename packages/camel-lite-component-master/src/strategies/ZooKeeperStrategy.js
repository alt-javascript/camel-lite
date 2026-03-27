import { createRequire } from 'node:module';
import { LoggerFactory } from '@alt-javascript/logger';
import { LockStrategy } from '../LockStrategy.js';

const require = createRequire(import.meta.url);
const zookeeper = require('node-zookeeper-client');
const { CreateMode, Exception } = zookeeper;

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/master/ZooKeeperStrategy');

const BASE_PATH = '/camel-lite/master';

class ZooKeeperStrategy extends LockStrategy {
  #hosts;
  #sessionTimeout;
  #client = null;
  #connected = false;

  constructor(options = {}) {
    super();
    this.#hosts = options.hosts ?? 'localhost:2181';
    this.#sessionTimeout = options.sessionTimeout ?? 30000;
  }

  async #connect() {
    if (this.#connected) return;
    return new Promise((resolve, reject) => {
      const client = zookeeper.createClient(this.#hosts, { sessionTimeout: this.#sessionTimeout });
      client.once('connected', () => {
        this.#connected = true;
        this.#client = client;
        log.info(`ZooKeeperStrategy connected to ${this.#hosts}`);
        resolve();
      });
      client.once('disconnected', () => {
        this.#connected = false;
        log.warn('ZooKeeperStrategy disconnected');
      });
      client.connect();
      setTimeout(() => reject(new Error(`ZooKeeper connect timeout (${this.#hosts})`)), this.#sessionTimeout);
    });
  }

  #nodePath(serviceName, nodeId) {
    return `${BASE_PATH}/${serviceName}/${nodeId}`;
  }

  #servicePath(serviceName) {
    return `${BASE_PATH}/${serviceName}`;
  }

  async acquire(serviceName, nodeId) {
    await this.#connect();
    const path = this.#nodePath(serviceName, nodeId);

    // Ensure parent path exists
    await this.#mkdirp(this.#servicePath(serviceName));

    return new Promise((resolve, reject) => {
      this.#client.create(
        path,
        Buffer.from(nodeId),
        CreateMode.EPHEMERAL,
        (err) => {
          if (!err) {
            log.debug(`ZooKeeper lock acquired: ${path}`);
            return resolve(true);
          }
          if (err.code === Exception.NODE_EXISTS) {
            // Node exists — check if it's ours (session reconnect scenario)
            this.#client.getData(path, (err2, data) => {
              if (err2) return resolve(false); // node gone or inaccessible
              resolve(data && data.toString() === nodeId);
            });
          } else {
            reject(err);
          }
        }
      );
    });
  }

  async release(serviceName, nodeId) {
    if (!this.#connected || !this.#client) return;
    const path = this.#nodePath(serviceName, nodeId);
    return new Promise((resolve) => {
      this.#client.remove(path, -1, (err) => {
        if (err && err.code !== Exception.NO_NODE) {
          log.warn(`ZooKeeper release error: ${err.message}`);
        }
        resolve();
      });
    });
  }

  async renew(serviceName, nodeId) {
    if (!this.#connected || !this.#client) return false;
    const path = this.#nodePath(serviceName, nodeId);
    return new Promise((resolve) => {
      this.#client.exists(path, (err, stat) => {
        if (err) return resolve(false);
        resolve(stat !== null);
      });
    });
  }

  async close() {
    if (this.#client) {
      this.#client.close();
      this.#client = null;
      this.#connected = false;
    }
  }

  async #mkdirp(path) {
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      await new Promise((resolve) => {
        this.#client.mkdirp(current, (err) => resolve()); // ignore errors (already exists)
      });
    }
  }
}

export { ZooKeeperStrategy };
export default ZooKeeperStrategy;
