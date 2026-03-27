import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { CamelContext, Exchange, Component } from 'camel-lite-core';
import { FtpComponent, FtpEndpoint, FtpProducer, FtpConsumer } from 'camel-lite-component-ftp';

// Mock FtpClient — records calls, no network activity
class MockFtpClient {
  calls = [];
  uploaded = {};
  // Files available for listing/downloading
  remoteFiles = [
    { name: 'alpha.txt', isFile: true, size: 10 },
    { name: 'beta.txt', isFile: true, size: 8 },
  ];
  fileContents = {
    '/remote/alpha.txt': 'content-alpha',
    '/remote/beta.txt': 'content-beta',
  };

  async access(opts) {
    this.calls.push(['access', opts]);
  }

  async uploadFrom(stream, remotePath) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    this.uploaded[remotePath] = Buffer.concat(chunks).toString('utf8');
    this.calls.push(['uploadFrom', remotePath]);
  }

  async list(remotePath) {
    this.calls.push(['list', remotePath]);
    return this.remoteFiles;
  }

  async downloadTo(writable, remotePath) {
    const content = this.fileContents[remotePath] ?? 'default-content';
    writable.write(Buffer.from(content));
    writable.end();
    this.calls.push(['downloadTo', remotePath]);
    // Wait for writable to finish
    await new Promise(r => writable.on('finish', r));
  }

  close() {
    this.calls.push(['close']);
  }
}

function makeMockFactory(mockClient) {
  return () => mockClient;
}

describe('FtpProducer', () => {
  it('send() calls access, uploadFrom, close on the client', async () => {
    const mock = new MockFtpClient();
    const producer = new FtpProducer('localhost', 21, 'user', 'pass', '/remote/out.txt', makeMockFactory(mock));
    const exchange = new Exchange();
    exchange.in.body = 'hello ftp';

    await producer.send(exchange);

    assert.ok(mock.calls.some(c => c[0] === 'access'));
    assert.ok(mock.calls.some(c => c[0] === 'uploadFrom'));
    assert.ok(mock.calls.some(c => c[0] === 'close'));
    assert.equal(mock.uploaded['/remote/out.txt'], 'hello ftp');
    assert.equal(exchange.out.getHeader('CamelFtpRemotePath'), '/remote/out.txt');
  });

  it('send() serialises non-string body as JSON', async () => {
    const mock = new MockFtpClient();
    const producer = new FtpProducer('localhost', 21, 'user', 'pass', '/remote/data.json', makeMockFactory(mock));
    const exchange = new Exchange();
    exchange.in.body = { key: 'value' };

    await producer.send(exchange);

    assert.deepEqual(JSON.parse(mock.uploaded['/remote/data.json']), { key: 'value' });
  });

  it('send() uses CamelFileName header as remote path when set', async () => {
    const mock = new MockFtpClient();
    const producer = new FtpProducer('localhost', 21, 'user', 'pass', '/default.txt', makeMockFactory(mock));
    const exchange = new Exchange();
    exchange.in.body = 'named';
    exchange.in.setHeader('CamelFileName', '/remote/named.txt');

    await producer.send(exchange);

    assert.ok('/remote/named.txt' in mock.uploaded);
    assert.equal(mock.uploaded['/remote/named.txt'], 'named');
  });

  it('send() closes client even when upload fails', async () => {
    const mock = new MockFtpClient();
    mock.uploadFrom = async () => { throw new Error('upload failed'); };

    const producer = new FtpProducer('localhost', 21, 'user', 'pass', '/remote/fail.txt', makeMockFactory(mock));
    const exchange = new Exchange();
    exchange.in.body = 'data';

    await assert.rejects(() => producer.send(exchange), { message: 'upload failed' });
    assert.ok(mock.calls.some(c => c[0] === 'close'), 'close should be called even on error');
  });
});

describe('FtpConsumer', () => {
  it('poll() returns one exchange per remote file with correct body', async () => {
    const mock = new MockFtpClient();
    const ctx = new CamelContext();
    const consumer = new FtpConsumer(
      'ftp://localhost/remote', ctx,
      'localhost', 21, 'user', 'pass', '/remote',
      makeMockFactory(mock)
    );
    await consumer.start();

    const exchanges = await consumer.poll();

    assert.equal(exchanges.length, 2);
    const bodies = exchanges.map(e => e.in.body).sort();
    assert.deepEqual(bodies, ['content-alpha', 'content-beta']);
    assert.ok(mock.calls.some(c => c[0] === 'list'));
    assert.ok(mock.calls.some(c => c[0] === 'downloadTo'));
    assert.ok(mock.calls.some(c => c[0] === 'close'));

    await consumer.stop();
  });

  it('poll() sets CamelFileName header on each exchange', async () => {
    const mock = new MockFtpClient();
    const ctx = new CamelContext();
    const consumer = new FtpConsumer(
      'ftp://localhost/remote', ctx,
      'localhost', 21, 'user', 'pass', '/remote',
      makeMockFactory(mock)
    );
    await consumer.start();

    const exchanges = await consumer.poll();
    const names = exchanges.map(e => e.in.getHeader('CamelFileName')).sort();
    assert.deepEqual(names, ['alpha.txt', 'beta.txt']);

    await consumer.stop();
  });

  it('start() registers consumer with context; stop() deregisters', async () => {
    const mock = new MockFtpClient();
    const ctx = new CamelContext();
    const consumer = new FtpConsumer(
      'ftp://localhost/remote', ctx,
      'localhost', 21, 'user', 'pass', '/remote',
      makeMockFactory(mock)
    );

    await consumer.start();
    assert.strictEqual(ctx.getConsumer('ftp://localhost/remote'), consumer);

    await consumer.stop();
    assert.ok(!ctx.getConsumer('ftp://localhost/remote'));
  });
});

describe('FtpEndpoint', () => {
  it('parses ftp:// URI: host, port, user, password, remotePath', () => {
    const ctx = new CamelContext();
    const ep = new FtpEndpoint(
      'ftp://myuser:mypass@ftphost.example.com:2121/uploads',
      'uploads',
      new URLSearchParams(),
      ctx
    );
    assert.equal(ep.host, 'ftphost.example.com');
    assert.equal(ep.port, 2121);
    assert.equal(ep.user, 'myuser');
    assert.equal(ep.password, 'mypass');
    assert.equal(ep.remotePath, '/uploads');
  });

  it('defaults port to 21 when not specified', () => {
    const ctx = new CamelContext();
    const ep = new FtpEndpoint(
      'ftp://host/path',
      'path',
      new URLSearchParams(),
      ctx
    );
    assert.equal(ep.port, 21);
  });
});

describe('cross-package import integration', () => {
  it('FtpComponent is a subclass of Component', () => {
    assert.ok(new FtpComponent() instanceof Component);
  });

  it('FtpComponent.createEndpoint returns FtpEndpoint', () => {
    const ctx = new CamelContext();
    const comp = new FtpComponent();
    const ep = comp.createEndpoint('ftp://localhost/test', 'test', new URLSearchParams(), ctx);
    assert.ok(ep instanceof FtpEndpoint);
  });
});
