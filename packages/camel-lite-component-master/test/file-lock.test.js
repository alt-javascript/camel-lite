import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { CamelContext } from '@alt-javascript/camel-lite-core';
import { MasterComponent, FileLockStrategy } from '../src/index.js';

const TEST_LOCK_DIR = join(tmpdir(), 'camel-lite-master-test-' + process.pid);

async function cleanLock(service) {
  try { await unlink(join(TEST_LOCK_DIR, `${service}.lock`)); } catch { /* ok */ }
}

// ---------------------------------------------------------------------------
// Unit: FileLockStrategy
// ---------------------------------------------------------------------------

describe('FileLockStrategy: acquire/release/renew', () => {
  it('acquire creates lock file and returns true', async () => {
    const s = new FileLockStrategy({ lockDir: TEST_LOCK_DIR });
    await cleanLock('unit-test-1');
    const won = await s.acquire('unit-test-1', 'nodeA');
    assert.equal(won, true);
    await s.release('unit-test-1', 'nodeA');
  });

  it('acquire is re-entrant for same nodeId', async () => {
    const s = new FileLockStrategy({ lockDir: TEST_LOCK_DIR });
    await cleanLock('unit-test-2');
    await s.acquire('unit-test-2', 'nodeA');
    const won2 = await s.acquire('unit-test-2', 'nodeA');
    assert.equal(won2, true);
    await s.release('unit-test-2', 'nodeA');
  });

  it('second node cannot acquire while first holds lock', async () => {
    const s = new FileLockStrategy({ lockDir: TEST_LOCK_DIR });
    await cleanLock('unit-test-3');
    await s.acquire('unit-test-3', 'nodeA');
    const won = await s.acquire('unit-test-3', 'nodeB');
    assert.equal(won, false);
    await s.release('unit-test-3', 'nodeA');
  });

  it('release allows another node to acquire', async () => {
    const s = new FileLockStrategy({ lockDir: TEST_LOCK_DIR });
    await cleanLock('unit-test-4');
    await s.acquire('unit-test-4', 'nodeA');
    await s.release('unit-test-4', 'nodeA');
    const won = await s.acquire('unit-test-4', 'nodeB');
    assert.equal(won, true);
    await s.release('unit-test-4', 'nodeB');
  });

  it('renew returns true when lock held', async () => {
    const s = new FileLockStrategy({ lockDir: TEST_LOCK_DIR });
    await cleanLock('unit-test-5');
    await s.acquire('unit-test-5', 'nodeA');
    const ok = await s.renew('unit-test-5', 'nodeA');
    assert.equal(ok, true);
    await s.release('unit-test-5', 'nodeA');
  });

  it('renew returns false when lock file removed', async () => {
    const s = new FileLockStrategy({ lockDir: TEST_LOCK_DIR });
    await cleanLock('unit-test-6');
    await s.acquire('unit-test-6', 'nodeA');
    await cleanLock('unit-test-6'); // simulate lock file deleted externally
    const ok = await s.renew('unit-test-6', 'nodeA');
    assert.equal(ok, false);
  });

  it('release is a no-op when lock not held', async () => {
    const s = new FileLockStrategy({ lockDir: TEST_LOCK_DIR });
    await cleanLock('unit-test-7');
    await assert.doesNotReject(() => s.release('unit-test-7', 'nodeA'));
  });
});

// ---------------------------------------------------------------------------
// Integration: MasterConsumer with file backend
// ---------------------------------------------------------------------------

describe('MasterConsumer: file backend leader election', () => {
  before(async () => {
    await cleanLock('integ-svc');
  });

  after(async () => {
    await cleanLock('integ-svc');
  });

  it('fires exchange with CamelMasterIsLeader=true on election', async () => {
    const ctx = new CamelContext();
    ctx.addComponent('master', new MasterComponent());

    const received = [];
    const { RouteBuilder } = await import('@alt-javascript/camel-lite-core');
    const b = new RouteBuilder();
    b.from(`master:integ-svc?backend=file&lockDir=${TEST_LOCK_DIR}&pollInterval=100&nodeId=nodeInteg`).process(ex => {
      received.push({
        isLeader: ex.in.getHeader('CamelMasterIsLeader'),
        service: ex.in.getHeader('CamelMasterService'),
        nodeId: ex.in.getHeader('CamelMasterNodeId'),
      });
    });
    ctx.addRoutes(b);
    await ctx.start();

    // Wait for first poll + election
    await new Promise(r => setTimeout(r, 400));
    await ctx.stop();

    assert.ok(received.length >= 1, `expected at least 1 exchange, got ${received.length}`);
    assert.equal(received[0].isLeader, true);
    assert.equal(received[0].service, 'integ-svc');
    assert.equal(received[0].nodeId, 'nodeInteg');
  });

  it('second context on same service does not win while first holds lock', async () => {
    const ctx1 = new CamelContext();
    const ctx2 = new CamelContext();
    ctx1.addComponent('master', new MasterComponent());
    ctx2.addComponent('master', new MasterComponent());

    const wins1 = [], wins2 = [];
    const { RouteBuilder } = await import('@alt-javascript/camel-lite-core');

    const b1 = new RouteBuilder();
    b1.from(`master:integ-svc?backend=file&lockDir=${TEST_LOCK_DIR}&pollInterval=100&nodeId=node1`).process(ex => {
      if (ex.in.getHeader('CamelMasterIsLeader')) wins1.push(true);
    });
    ctx1.addRoutes(b1);

    const b2 = new RouteBuilder();
    b2.from(`master:integ-svc?backend=file&lockDir=${TEST_LOCK_DIR}&pollInterval=100&nodeId=node2`).process(ex => {
      if (ex.in.getHeader('CamelMasterIsLeader')) wins2.push(true);
    });
    ctx2.addRoutes(b2);

    await ctx1.start();
    await ctx2.start();

    await new Promise(r => setTimeout(r, 500));

    await ctx1.stop();
    await ctx2.stop();
    await cleanLock('integ-svc');

    // Exactly one should have won
    const totalWins = wins1.length + wins2.length;
    assert.equal(totalWins, 1, `expected exactly 1 winner, got wins1=${wins1.length} wins2=${wins2.length}`);
  });
});
