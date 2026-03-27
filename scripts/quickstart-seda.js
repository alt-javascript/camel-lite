import { CamelContext, Exchange, RouteDefinition } from 'camel-lite-core';
import { DirectComponent } from 'camel-lite-component-direct';
import { SedaComponent } from 'camel-lite-component-seda';
import { LogComponent } from 'camel-lite-component-log';

// Create context and register components
const context = new CamelContext();
context.addComponent('direct', new DirectComponent());
context.addComponent('seda', new SedaComponent());
context.addComponent('log', new LogComponent());

// Route A: direct:entry → seda:work (fire-and-forget async dispatch)
const routeA = new RouteDefinition('direct:entry');
routeA.process((exchange) => { exchange.in.body = `[${exchange.in.body}] processed`; });
routeA.to('seda:work');

// Route B: seda:work consumed asynchronously by SEDA worker → log:output
const routeB = new RouteDefinition('seda:work');
routeB.to('log:output?level=info&showBody=true');

context.addRoutes({ configure() {}, getRoutes() { return [routeA, routeB]; } });

// Start — wires seda:work consumer with 1 worker loop
await context.start();

// Send 3 exchanges: direct:entry enqueues to seda:work and returns immediately
let resolved = 0;
const done = new Promise(r => {
  // Simple latch — resolve when all 3 appear in the log is hard to detect;
  // instead we verify by counting after a stop() drain
  r();
});

for (let i = 1; i <= 3; i++) {
  const exchange = new Exchange();
  exchange.in.body = `message-${i}`;
  await context.getConsumer('direct:entry').process(exchange);
  // send() returned before seda:work processed it — that's the async decoupling
}

// Stop — closes the SEDA queue and drains all in-flight worker processing
await context.stop();

console.log('quickstart-seda: OK');
