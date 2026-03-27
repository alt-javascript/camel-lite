import { LoggerFactory } from '@alt-javascript/logger';
import { LockStrategy } from '../LockStrategy.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/master/ConsulStrategy');

const KV_PREFIX = 'camel-lite/master';

class ConsulStrategy extends LockStrategy {
  #host;
  #port;
  #ttl;
  #requestTimeout;
  #sessionId = null;

  constructor(options = {}) {
    super();
    this.#host = options.host ?? 'localhost';
    this.#port = options.port ?? 8500;
    this.#ttl = options.ttl ?? '15s';
    this.#requestTimeout = options.requestTimeout ?? 5000;
  }

  #baseUrl() {
    return `http://${this.#host}:${this.#port}/v1`;
  }

  async #fetchJson(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#requestTimeout);
    try {
      const res = await fetch(`${this.#baseUrl()}${path}`, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      try { return JSON.parse(text); } catch { return text; }
    } finally {
      clearTimeout(timer);
    }
  }

  async #createSession(nodeId) {
    const result = await this.#fetchJson('PUT', '/session/create', {
      Name: nodeId,
      TTL: this.#ttl,
      Behavior: 'delete',
    });
    return result?.ID ?? null;
  }

  async acquire(serviceName, nodeId) {
    // Create session if needed
    if (!this.#sessionId) {
      this.#sessionId = await this.#createSession(nodeId);
      if (!this.#sessionId) {
        log.warn(`ConsulStrategy: failed to create session`);
        return false;
      }
    }

    const kvKey = `${KV_PREFIX}/${serviceName}`;
    const result = await this.#fetchJson('PUT', `/kv/${kvKey}?acquire=${this.#sessionId}`, nodeId);
    const won = result === true || result === 'true';
    if (won) log.debug(`Consul lock acquired: ${kvKey} session=${this.#sessionId}`);
    return won;
  }

  async release(serviceName, nodeId) {
    if (!this.#sessionId) return;
    const kvKey = `${KV_PREFIX}/${serviceName}`;
    try {
      await this.#fetchJson('PUT', `/kv/${kvKey}?release=${this.#sessionId}`, nodeId);
      await this.#fetchJson('PUT', `/session/destroy/${this.#sessionId}`, null);
    } catch (err) {
      log.warn(`ConsulStrategy release error: ${err.message}`);
    } finally {
      this.#sessionId = null;
    }
  }

  async renew(serviceName, nodeId) {
    if (!this.#sessionId) return false;
    try {
      const result = await this.#fetchJson('PUT', `/session/renew/${this.#sessionId}`, null);
      return Array.isArray(result) && result.length > 0;
    } catch {
      return false;
    }
  }

  async close() {
    // release() handles cleanup; close is a no-op
  }
}

export { ConsulStrategy };
export default ConsulStrategy;
