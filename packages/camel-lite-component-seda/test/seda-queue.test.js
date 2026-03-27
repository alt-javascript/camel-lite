import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SedaQueue } from '../src/SedaQueue.js';
import { SedaQueueFullError } from '@alt-javascript/camel-lite-core';

describe('SedaQueue', () => {
  it('enqueue then dequeue returns the item', async () => {
    const q = new SedaQueue();
    q.enqueue('hello');
    const item = await q.dequeue();
    assert.equal(item, 'hello');
  });

  it('dequeue before enqueue — resolves when item arrives', async () => {
    const q = new SedaQueue();
    const deqPromise = q.dequeue();
    q.enqueue('late');
    const item = await deqPromise;
    assert.equal(item, 'late');
  });

  it('multiple items dequeued in FIFO order', async () => {
    const q = new SedaQueue();
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    assert.equal(await q.dequeue(), 1);
    assert.equal(await q.dequeue(), 2);
    assert.equal(await q.dequeue(), 3);
  });

  it('close() resolves all waiting consumers with null', async () => {
    const q = new SedaQueue();
    const p1 = q.dequeue();
    const p2 = q.dequeue();
    q.close();
    assert.equal(await p1, null);
    assert.equal(await p2, null);
  });

  it('dequeue on a closed empty queue returns null immediately', async () => {
    const q = new SedaQueue();
    q.close();
    const item = await q.dequeue();
    assert.equal(item, null);
  });

  it('enqueue after close throws', () => {
    const q = new SedaQueue();
    q.close();
    assert.throws(() => q.enqueue('x'), { message: 'SedaQueue is closed' });
  });

  it('size reflects queued items', () => {
    const q = new SedaQueue();
    assert.equal(q.size, 0);
    q.enqueue('a');
    q.enqueue('b');
    assert.equal(q.size, 2);
  });

  it('closed reflects queue state', () => {
    const q = new SedaQueue();
    assert.equal(q.closed, false);
    q.close();
    assert.equal(q.closed, true);
  });

  it('maxSize=2: enqueue 2 succeeds, 3rd throws SedaQueueFullError', () => {
    const q = new SedaQueue(2);
    q.enqueue('a');
    q.enqueue('b');
    assert.throws(
      () => q.enqueue('c'),
      (err) => {
        assert.ok(err instanceof SedaQueueFullError);
        assert.equal(err.name, 'SedaQueueFullError');
        assert.equal(err.maxSize, 2);
        return true;
      }
    );
  });

  it('maxSize=0 (unlimited): accepts many items without throwing', () => {
    const q = new SedaQueue(0);
    for (let i = 0; i < 1000; i++) q.enqueue(i);
    assert.equal(q.size, 1000);
  });

  it('direct delivery to waiting consumer bypasses items array (size stays 0)', async () => {
    const q = new SedaQueue();
    const p = q.dequeue(); // waiter registered
    assert.equal(q.size, 0);
    q.enqueue('direct');
    assert.equal(q.size, 0); // delivered directly, not buffered
    assert.equal(await p, 'direct');
  });
});
