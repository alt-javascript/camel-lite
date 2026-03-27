import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ConsulStrategy } from '../src/strategies/ConsulStrategy.js';

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function makeFetchMock(responses) {
  let callIndex = 0;
  return async function mockFetch(url, opts) {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      text: async () => typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body),
    };
  };
}

// ---------------------------------------------------------------------------
// Unit tests: ConsulStrategy with mocked fetch
// ---------------------------------------------------------------------------

describe('ConsulStrategy: acquire', () => {
  it('acquire creates session then acquires KV lock, returns true', async () => {
    const strategy = new ConsulStrategy({ host: 'localhost', port: 8500, ttl: '10s' });

    // Patch global fetch for this test
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, method: opts?.method });
      if (url.includes('/session/create')) {
        return { text: async () => JSON.stringify({ ID: 'sess-abc' }) };
      }
      if (url.includes('/kv/') && url.includes('acquire=')) {
        return { text: async () => 'true' };
      }
      return { text: async () => 'null' };
    };

    const won = await strategy.acquire('my-service', 'nodeA');
    assert.equal(won, true);
    assert.ok(calls.some(c => c.url.includes('/session/create')));
    assert.ok(calls.some(c => c.url.includes('/kv/') && c.url.includes('acquire=')));
  });

  it('acquire returns false when KV acquire returns false', async () => {
    const strategy = new ConsulStrategy({ host: 'localhost', port: 8500 });

    global.fetch = async (url, opts) => {
      if (url.includes('/session/create')) {
        return { text: async () => JSON.stringify({ ID: 'sess-xyz' }) };
      }
      if (url.includes('/kv/') && url.includes('acquire=')) {
        return { text: async () => 'false' };
      }
      return { text: async () => 'null' };
    };

    const won = await strategy.acquire('my-service', 'nodeB');
    assert.equal(won, false);
  });

  it('acquire returns false when session create fails', async () => {
    const strategy = new ConsulStrategy({ host: 'localhost', port: 8500 });

    global.fetch = async () => {
      return { text: async () => '{}' }; // no ID field
    };

    const won = await strategy.acquire('my-service', 'nodeC');
    assert.equal(won, false);
  });
});

describe('ConsulStrategy: renew', () => {
  it('renew returns true when session/renew responds with array', async () => {
    const strategy = new ConsulStrategy({ host: 'localhost', port: 8500 });
    // Pre-seed sessionId via a successful acquire
    global.fetch = async (url) => {
      if (url.includes('/session/create')) return { text: async () => JSON.stringify({ ID: 'sess-renew' }) };
      if (url.includes('acquire=')) return { text: async () => 'true' };
      if (url.includes('/session/renew/')) return { text: async () => JSON.stringify([{ ID: 'sess-renew' }]) };
      return { text: async () => 'null' };
    };
    await strategy.acquire('svc', 'node1');
    const ok = await strategy.renew('svc', 'node1');
    assert.equal(ok, true);
  });

  it('renew returns false with no session', async () => {
    const strategy = new ConsulStrategy({ host: 'localhost', port: 8500 });
    const ok = await strategy.renew('svc', 'node1');
    assert.equal(ok, false);
  });
});

describe('ConsulStrategy: release', () => {
  it('release calls kv release and session destroy', async () => {
    const strategy = new ConsulStrategy({ host: 'localhost', port: 8500 });
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, method: opts?.method });
      if (url.includes('/session/create')) return { text: async () => JSON.stringify({ ID: 'sess-rel' }) };
      return { text: async () => 'true' };
    };
    await strategy.acquire('svc', 'node1');
    await strategy.release('svc', 'node1');
    assert.ok(calls.some(c => c.url.includes('release=')));
    assert.ok(calls.some(c => c.url.includes('/session/destroy/')));
  });

  it('release is a no-op when no session', async () => {
    const strategy = new ConsulStrategy({ host: 'localhost', port: 8500 });
    await assert.doesNotReject(() => strategy.release('svc', 'node1'));
  });
});

describe('ConsulStrategy: construction', () => {
  it('defaults host/port/ttl', () => {
    assert.doesNotThrow(() => new ConsulStrategy());
  });

  it('accepts explicit options', () => {
    assert.doesNotThrow(() => new ConsulStrategy({ host: 'consul.local', port: 8500, ttl: '30s' }));
  });
});
