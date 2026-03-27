/**
 * LockStrategy — abstract base for leader election backends.
 *
 * Implementations: FileLockStrategy, ZooKeeperStrategy, ConsulStrategy.
 *
 * All methods are async. Implementations must be safe to call concurrently
 * (the MasterConsumer serialises calls via its polling loop, but strategies
 * should not assume single-threaded access if reused across contexts).
 */
class LockStrategy {
  /**
   * Attempt to acquire the leader lock for serviceName as nodeId.
   * @param {string} serviceName
   * @param {string} nodeId
   * @returns {Promise<boolean>} true if this node now holds the lock
   */
  async acquire(serviceName, nodeId) { // eslint-disable-line no-unused-vars
    throw new Error('LockStrategy.acquire() not implemented');
  }

  /**
   * Release the leader lock held by nodeId.
   * No-op if not currently held by this nodeId.
   * @param {string} serviceName
   * @param {string} nodeId
   * @returns {Promise<void>}
   */
  async release(serviceName, nodeId) { // eslint-disable-line no-unused-vars
    throw new Error('LockStrategy.release() not implemented');
  }

  /**
   * Renew (heartbeat) the leader lock.
   * Returns false if the lock was lost since last acquire/renew.
   * @param {string} serviceName
   * @param {string} nodeId
   * @returns {Promise<boolean>}
   */
  async renew(serviceName, nodeId) { // eslint-disable-line no-unused-vars
    throw new Error('LockStrategy.renew() not implemented');
  }

  /**
   * Close any open connections or file handles.
   * Called once when the MasterConsumer stops.
   * @returns {Promise<void>}
   */
  async close() {
    // default no-op
  }
}

export { LockStrategy };
export default LockStrategy;
