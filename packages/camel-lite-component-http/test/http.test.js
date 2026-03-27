import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { CamelContext, Exchange, Component } from 'camel-lite-core';
import { HttpComponent, HttpEndpoint, HttpProducer } from 'camel-lite-component-http';

// Spin a minimal local HTTP server for testing — no external network calls
function makeTestServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

describe('HttpProducer', () => {
  it('GET request: exchange.out.body contains response and CamelHttpResponseCode is 200', async () => {
    const { server, port } = await makeTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, method: req.method }));
    });

    try {
      const producer = new HttpProducer(`http://127.0.0.1:${port}/test`);
      const exchange = new Exchange();
      await producer.send(exchange);

      assert.equal(exchange.out.getHeader('CamelHttpResponseCode'), 200);
      const body = JSON.parse(exchange.out.body);
      assert.equal(body.ok, true);
      assert.equal(body.method, 'GET');
      assert.equal(exchange.exception, null);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  it('POST request sends body and receives echo', async () => {
    const { server, port } = await makeTestServer((req, res) => {
      let data = '';
      req.on('data', c => { data += c; });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('echo:' + data);
      });
    });

    try {
      const producer = new HttpProducer(`http://127.0.0.1:${port}/echo`, 'POST');
      const exchange = new Exchange();
      exchange.in.body = 'ping';
      await producer.send(exchange);

      assert.equal(exchange.out.getHeader('CamelHttpResponseCode'), 200);
      assert.equal(exchange.out.body, 'echo:ping');
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  it('CamelHttpMethod header overrides default method', async () => {
    const methods = [];
    const { server, port } = await makeTestServer((req, res) => {
      methods.push(req.method);
      res.writeHead(200);
      res.end('ok');
    });

    try {
      // Default is GET, but header overrides to PUT
      const producer = new HttpProducer(`http://127.0.0.1:${port}/`);
      const exchange = new Exchange();
      exchange.in.setHeader('CamelHttpMethod', 'PUT');
      exchange.in.body = 'data';
      await producer.send(exchange);

      assert.equal(methods[0], 'PUT');
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  it('404 response: CamelHttpResponseCode is 404, exchange.exception is null', async () => {
    const { server, port } = await makeTestServer((req, res) => {
      res.writeHead(404);
      res.end('not found');
    });

    try {
      const producer = new HttpProducer(`http://127.0.0.1:${port}/missing`);
      const exchange = new Exchange();
      await producer.send(exchange);

      // HTTP errors are not exceptions — they land in exchange.out
      assert.equal(exchange.out.getHeader('CamelHttpResponseCode'), 404);
      assert.equal(exchange.out.body, 'not found');
      assert.equal(exchange.exception, null);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  it('POST with object body: serialised as JSON', async () => {
    let receivedBody = '';
    const { server, port } = await makeTestServer((req, res) => {
      let data = '';
      req.on('data', c => { data += c; });
      req.on('end', () => {
        receivedBody = data;
        res.writeHead(200);
        res.end('ok');
      });
    });

    try {
      const producer = new HttpProducer(`http://127.0.0.1:${port}/`, 'POST');
      const exchange = new Exchange();
      exchange.in.body = { hello: 'world' };
      await producer.send(exchange);

      assert.deepEqual(JSON.parse(receivedBody), { hello: 'world' });
    } finally {
      await new Promise(r => server.close(r));
    }
  });
});

describe('HttpEndpoint', () => {
  it('reconstructs URL correctly from URI', () => {
    const ctx = new CamelContext();
    const ep = new HttpEndpoint(
      'http:example.com/api/v1',
      'example.com/api/v1',
      new URLSearchParams(),
      ctx
    );
    assert.equal(ep.url, 'http://example.com/api/v1');
    assert.equal(ep.method, 'GET');
  });

  it('method= URI param sets default method', () => {
    const ctx = new CamelContext();
    const ep = new HttpEndpoint(
      'http:example.com/api?method=POST',
      'example.com/api',
      new URLSearchParams('method=POST'),
      ctx
    );
    assert.equal(ep.method, 'POST');
  });

  it('createConsumer throws (producer-only)', () => {
    const ctx = new CamelContext();
    const ep = new HttpEndpoint('http:example.com', 'example.com', new URLSearchParams(), ctx);
    assert.throws(() => ep.createConsumer(), { message: /producer-only/ });
  });
});

describe('cross-package import integration', () => {
  it('HttpComponent is a subclass of Component', () => {
    assert.ok(new HttpComponent() instanceof Component);
  });

  it('HttpComponent.createEndpoint returns HttpEndpoint', () => {
    const ctx = new CamelContext();
    const comp = new HttpComponent();
    const ep = comp.createEndpoint('http:example.com', 'example.com', new URLSearchParams(), ctx);
    assert.ok(ep instanceof HttpEndpoint);
  });
});
