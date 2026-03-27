import { CamelContext, Exchange, RouteDefinition } from 'camel-lite-core';
import { DirectComponent } from 'camel-lite-component-direct';
import { FileComponent, FileConsumer } from 'camel-lite-component-file';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

const workDir = join(tmpdir(), 'camel-lite-file-' + randomUUID());

const context = new CamelContext();
context.addComponent('direct', new DirectComponent());
context.addComponent('file', new FileComponent());

// Route: direct:entry → file:workDir (writes body to disk)
const route = new RouteDefinition('direct:entry');
route.process((exchange) => { /* body already set by caller */ });
route.to(`file:${workDir}?fileName=msg.txt`);

context.addRoutes({ configure() {}, getRoutes() { return [route]; } });
await context.start();

// Write 3 exchanges with different filenames via CamelFileName header
const messages = ['hello world', 'second message', 'third message'];
for (let i = 0; i < messages.length; i++) {
  const exchange = new Exchange();
  exchange.in.body = messages[i];
  exchange.in.setHeader('CamelFileName', `message-${i}.txt`);
  await context.getConsumer('direct:entry').process(exchange);
}

await context.stop();

// Poll them back with FileConsumer (noop=true — don't move)
const ctx2 = new CamelContext();
const consumer = new FileConsumer(`file:${workDir}`, ctx2, workDir, true);
await consumer.start();
const exchanges = await consumer.poll();
await consumer.stop();

console.log(`Read ${exchanges.length} files:`);
for (const ex of exchanges) {
  console.log(`  ${ex.in.getHeader('CamelFileName')}: ${ex.in.body}`);
}

if (exchanges.length !== 3) {
  console.error(`FAIL: expected 3 files, got ${exchanges.length}`);
  process.exit(1);
}

await rm(workDir, { recursive: true, force: true });
console.log('quickstart-file: OK');
