import { CamelContext, Exchange, RouteDefinition } from 'camel-lite-core';
import { DirectComponent } from 'camel-lite-component-direct';
import { HttpComponent } from 'camel-lite-component-http';
import { createServer } from 'node:http';

// Spin a local HTTP server so no external network is needed
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'hello from camel-lite', method: req.method }));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

const context = new CamelContext();
context.addComponent('direct', new DirectComponent());
context.addComponent('http', new HttpComponent());

// Route: direct:entry → http:localhost:{port}/hello
const route = new RouteDefinition('direct:entry');
route.to(`http:127.0.0.1:${port}/hello`);

context.addRoutes({ configure() {}, getRoutes() { return [route]; } });
await context.start();

const exchange = new Exchange();
await context.getConsumer('direct:entry').process(exchange);

await context.stop();
server.close();

const body = JSON.parse(exchange.in.body);
const status = exchange.in.getHeader('CamelHttpResponseCode');

console.log(`HTTP ${status}: ${JSON.stringify(body)}`);

if (status !== 200 || body.message !== 'hello from camel-lite') {
  console.error('FAIL: unexpected response');
  process.exit(1);
}

console.log('quickstart-http: OK');
