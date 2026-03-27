import { Consumer, Exchange } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/MasterConsumer');

class MasterConsumer extends Consumer {
  #uri;
  #service;
  #backend;
  #nodeId;
  #renewInterval;
  #pollInterval;
  #lockOptions;
  #context;
  #pipeline;
  #strategy = null;
  #isLeader = false;
  #stopped = false;
  #pollHandle = null;

  constructor(uri, service, backend, nodeId, renewInterval, pollInterval, lockOptions, context, pipeline) {
    super();
    this.#uri = uri;
    this.#service = service;
    this.#backend = backend;
    this.#nodeId = nodeId;
    this.#renewInterval = renewInterval;
    this.#pollInterval = pollInterval;
    this.#lockOptions = lockOptions;
    this.#context = context;
    this.#pipeline = pipeline;
  }

  get uri() { return this.#uri; }

  async start() {
    this.#stopped = false;
    this.#isLeader = false;
    this.#strategy = await this.#loadStrategy();
    this.#context.registerConsumer(this.#uri, this);
    log.info(`Master consumer started: service=${this.#service} backend=${this.#backend} nodeId=${this.#nodeId}`);

    // Start polling loop
    this.#schedulePoll();
  }

  #schedulePoll() {
    if (this.#stopped) return;
    this.#pollHandle = setTimeout(() => this.#poll(), this.#pollInterval);
  }

  async #poll() {
    if (this.#stopped) return;
    try {
      if (this.#isLeader) {
        // Renew the lock
        const still = await this.#strategy.renew(this.#service, this.#nodeId);
        if (!still) {
          log.info(`Master ${this.#service}: lost leadership (renewal failed)`);
          this.#isLeader = false;
          await this.#fireExchange(false);
        } else {
          log.debug(`Master ${this.#service}: renewed leadership`);
        }
      } else {
        // Try to acquire
        const won = await this.#strategy.acquire(this.#service, this.#nodeId);
        if (won) {
          log.info(`Master ${this.#service}: elected leader (nodeId=${this.#nodeId})`);
          this.#isLeader = true;
          await this.#fireExchange(true);
        } else {
          log.debug(`Master ${this.#service}: not leader, will retry`);
        }
      }
    } catch (err) {
      log.warn(`Master ${this.#service}: poll error: ${err.message}`);
    }
    this.#schedulePoll();
  }

  async #fireExchange(isLeader) {
    const exchange = new Exchange();
    exchange.in.setHeader('CamelMasterIsLeader', isLeader);
    exchange.in.setHeader('CamelMasterService', this.#service);
    exchange.in.setHeader('CamelMasterNodeId', this.#nodeId);
    exchange.in.body = null;
    try {
      await this.#pipeline.run(exchange);
    } catch (err) {
      log.error(`Master ${this.#service}: pipeline error: ${err.message}`);
    }
  }

  async stop() {
    this.#stopped = true;
    if (this.#pollHandle !== null) {
      clearTimeout(this.#pollHandle);
      this.#pollHandle = null;
    }
    if (this.#strategy) {
      try {
        await this.#strategy.release(this.#service, this.#nodeId);
        await this.#strategy.close();
      } catch (err) {
        log.warn(`Master ${this.#service}: error during stop cleanup: ${err.message}`);
      }
    }
    this.#isLeader = false;
    this.#context.registerConsumer(this.#uri, null);
    log.info(`Master consumer stopped: service=${this.#service}`);
  }

  async #loadStrategy() {
    switch (this.#backend) {
      case 'file': {
        const { FileLockStrategy } = await import('./strategies/FileLockStrategy.js');
        return new FileLockStrategy(this.#lockOptions);
      }
      case 'zookeeper': {
        const { ZooKeeperStrategy } = await import('./strategies/ZooKeeperStrategy.js');
        return new ZooKeeperStrategy(this.#lockOptions);
      }
      case 'consul': {
        const { ConsulStrategy } = await import('./strategies/ConsulStrategy.js');
        return new ConsulStrategy(this.#lockOptions);
      }
      default:
        throw new Error(`Unknown master backend: ${this.#backend}`);
    }
  }
}

export { MasterConsumer };
export default MasterConsumer;
