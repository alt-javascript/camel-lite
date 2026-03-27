import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { CamelContext, Exchange, Component } from '@alt-javascript/camel-lite-core';
import { FileComponent, FileEndpoint, FileProducer, FileConsumer } from '@alt-javascript/camel-lite-component-file';

function makeTmpDir() {
  return join(tmpdir(), 'camel-lite-file-test-' + randomUUID());
}

describe('FileProducer', () => {
  it('writes string body to disk with default filename (messageId.txt)', async () => {
    const dir = makeTmpDir();
    const producer = new FileProducer(dir);
    const exchange = new Exchange();
    exchange.in.body = 'hello file';

    await producer.send(exchange);

    const filePath = join(dir, exchange.in.messageId + '.txt');
    const content = await readFile(filePath, 'utf8');
    assert.equal(content, 'hello file');
    await rm(dir, { recursive: true, force: true });
  });

  it('uses CamelFileName header when set', async () => {
    const dir = makeTmpDir();
    const producer = new FileProducer(dir);
    const exchange = new Exchange();
    exchange.in.body = 'named content';
    exchange.in.setHeader('CamelFileName', 'custom.txt');

    await producer.send(exchange);

    const content = await readFile(join(dir, 'custom.txt'), 'utf8');
    assert.equal(content, 'named content');
    assert.equal(exchange.out.getHeader('CamelFileName'), 'custom.txt');
    await rm(dir, { recursive: true, force: true });
  });

  it('uses fileName constructor param as fallback', async () => {
    const dir = makeTmpDir();
    const producer = new FileProducer(dir, 'fixed.txt');
    const exchange = new Exchange();
    exchange.in.body = 'fixed name';

    await producer.send(exchange);

    const content = await readFile(join(dir, 'fixed.txt'), 'utf8');
    assert.equal(content, 'fixed name');
    await rm(dir, { recursive: true, force: true });
  });

  it('serialises non-string body as JSON', async () => {
    const dir = makeTmpDir();
    const producer = new FileProducer(dir, 'data.json');
    const exchange = new Exchange();
    exchange.in.body = { key: 'value', n: 42 };

    await producer.send(exchange);

    const content = await readFile(join(dir, 'data.json'), 'utf8');
    assert.deepEqual(JSON.parse(content), { key: 'value', n: 42 });
    await rm(dir, { recursive: true, force: true });
  });

  it('creates directory if it does not exist', async () => {
    const dir = join(makeTmpDir(), 'nested', 'path');
    const producer = new FileProducer(dir, 'out.txt');
    const exchange = new Exchange();
    exchange.in.body = 'nested';

    await producer.send(exchange);

    const content = await readFile(join(dir, 'out.txt'), 'utf8');
    assert.equal(content, 'nested');
    await rm(join(dir, '..', '..'), { recursive: true, force: true });
  });
});

describe('FileConsumer', () => {
  it('poll() returns one exchange per file with correct body', async () => {
    const dir = makeTmpDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'a.txt'), 'body-a', 'utf8');
    await writeFile(join(dir, 'b.txt'), 'body-b', 'utf8');
    await writeFile(join(dir, 'c.txt'), 'body-c', 'utf8');

    const ctx = new CamelContext();
    const consumer = new FileConsumer('file:' + dir, ctx, dir, true); // noop=true
    await consumer.start();

    const exchanges = await consumer.poll();
    assert.equal(exchanges.length, 3);
    const bodies = exchanges.map(e => e.in.body).sort();
    assert.deepEqual(bodies, ['body-a', 'body-b', 'body-c']);
    exchanges.forEach(e => {
      assert.ok(e.in.getHeader('CamelFileName'), 'CamelFileName header set');
      assert.ok(e.in.getHeader('CamelFilePath'), 'CamelFilePath header set');
    });

    await consumer.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('poll() moves files to .done/ by default (noop=false)', async () => {
    const dir = makeTmpDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'move.txt'), 'content', 'utf8');

    const ctx = new CamelContext();
    const consumer = new FileConsumer('file:' + dir, ctx, dir, false);
    await consumer.start();

    const exchanges = await consumer.poll();
    assert.equal(exchanges.length, 1);

    // Original file should be gone
    await assert.rejects(() => access(join(dir, 'move.txt')));
    // File should be in .done/
    const doneContent = await readFile(join(dir, '.done', 'move.txt'), 'utf8');
    assert.equal(doneContent, 'content');

    await consumer.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('poll() noop=true: files remain in place', async () => {
    const dir = makeTmpDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'stay.txt'), 'stays', 'utf8');

    const ctx = new CamelContext();
    const consumer = new FileConsumer('file:' + dir, ctx, dir, true);
    await consumer.start();

    await consumer.poll();

    // File should still be there
    const content = await readFile(join(dir, 'stay.txt'), 'utf8');
    assert.equal(content, 'stays');

    await consumer.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('poll() on empty dir returns []', async () => {
    const dir = makeTmpDir();
    await mkdir(dir, { recursive: true });

    const ctx = new CamelContext();
    const consumer = new FileConsumer('file:' + dir, ctx, dir, true);
    await consumer.start();

    const exchanges = await consumer.poll();
    assert.equal(exchanges.length, 0);

    await consumer.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('poll() on non-existent dir returns []', async () => {
    const dir = makeTmpDir(); // not created
    const ctx = new CamelContext();
    const consumer = new FileConsumer('file:' + dir, ctx, dir, true);
    await consumer.start();

    const exchanges = await consumer.poll();
    assert.equal(exchanges.length, 0);

    await consumer.stop();
  });
});

describe('cross-package import integration', () => {
  it('FileComponent is a subclass of Component', () => {
    assert.ok(new FileComponent() instanceof Component);
  });

  it('FileComponent.createEndpoint returns FileEndpoint', () => {
    const ctx = new CamelContext();
    const comp = new FileComponent();
    const ep = comp.createEndpoint('file:/tmp/test', '/tmp/test', new URLSearchParams(), ctx);
    assert.ok(ep instanceof FileEndpoint);
    assert.equal(ep.dir, '/tmp/test');
  });

  it('FileEndpoint.createProducer returns FileProducer', () => {
    const ctx = new CamelContext();
    const ep = new FileEndpoint('file:/tmp', '/tmp', new URLSearchParams(), ctx);
    assert.ok(ep.createProducer() instanceof FileProducer);
  });

  it('FileEndpoint.createConsumer returns FileConsumer', () => {
    const ctx = new CamelContext();
    const ep = new FileEndpoint('file:/tmp', '/tmp', new URLSearchParams(), ctx);
    assert.ok(ep.createConsumer(null) instanceof FileConsumer);
  });
});
