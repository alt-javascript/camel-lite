import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Exchange, CamelContext, RouteBuilder } from '@alt-javascript/camel-lite-core';
import { AmqpComponent, JmsMapper } from '@alt-javascript/camel-lite-component-amqp';

// ---------------------------------------------------------------------------
// T02: AmqpComponent URI parsing + AmqpProducer unit tests
// T03: AmqpConsumer lifecycle unit tests
// ---------------------------------------------------------------------------

// ── helpers ─────────────────────────────────────────────────────────────────

function makeExchange(body = 'hello amqp') {
  const ex = new Exchange();
  ex.in.body = body;
  return ex;
}

// ── JmsMapper unit tests ─────────────────────────────────────────────────────

describe('JmsMapper', () => {
  it('toAmqp10: maps JMS headers onto rhea message properties', () => {
    const ex = makeExchange();
    ex.in.setHeader('JMSMessageID', 'ID:12345');
    ex.in.setHeader('JMSCorrelationID', 'corr-abc');
    ex.in.setHeader('JMSTimestamp', 1700000000000);
    ex.in.setHeader('JMSType', 'OrderCreated');
    ex.in.setHeader('JMSDeliveryMode', 'PERSISTENT');
    ex.in.setHeader('JMSPriority', 5);

    const msg = {};
    JmsMapper.toAmqp10(ex, msg);

    assert.equal(msg.properties.message_id, 'ID:12345');
    assert.equal(msg.properties.correlation_id, 'corr-abc');
    assert.equal(msg.properties.creation_time, 1700000000000);
    assert.equal(msg.properties.subject, 'OrderCreated');
    assert.equal(msg.header.durable, true);
    assert.equal(msg.header.priority, 5);
  });

  it('fromAmqp10: maps rhea message properties to JMS headers on exchange', () => {
    const ex = makeExchange();
    const msg = {
      properties: {
        message_id: 'ID:99',
        correlation_id: 'corr-xyz',
        creation_time: 1700000001000,
        subject: 'OrderShipped',
      },
      header: { durable: false, priority: 3 },
    };

    JmsMapper.fromAmqp10(msg, ex);

    assert.equal(ex.in.getHeader('JMSMessageID'), 'ID:99');
    assert.equal(ex.in.getHeader('JMSCorrelationID'), 'corr-xyz');
    assert.equal(ex.in.getHeader('JMSTimestamp'), 1700000001000);
    assert.equal(ex.in.getHeader('JMSType'), 'OrderShipped');
    assert.equal(ex.in.getHeader('JMSDeliveryMode'), 'NON_PERSISTENT');
    assert.equal(ex.in.getHeader('JMSPriority'), 3);
  });

  it('toAmqp091: maps JMS headers onto amqplib options', () => {
    const ex = makeExchange();
    ex.in.setHeader('JMSMessageID', 'ID:55');
    ex.in.setHeader('JMSCorrelationID', 'corr-091');
    ex.in.setHeader('JMSTimestamp', 1700000002000);
    ex.in.setHeader('JMSType', 'Ping');
    ex.in.setHeader('JMSDeliveryMode', 'NON_PERSISTENT');

    const options = {};
    JmsMapper.toAmqp091(ex, options);

    assert.equal(options.messageId, 'ID:55');
    assert.equal(options.correlationId, 'corr-091');
    assert.equal(options.timestamp, 1700000002); // seconds
    assert.equal(options.type, 'Ping');
    assert.equal(options.deliveryMode, 1); // NON_PERSISTENT
  });

  it('fromAmqp091: maps amqplib message properties to JMS headers', () => {
    const ex = makeExchange();
    const msg = {
      properties: {
        messageId: 'ID:77',
        correlationId: 'corr-77',
        timestamp: 1700000003, // seconds
        type: 'Pong',
        deliveryMode: 2,
        priority: 7,
      },
    };

    JmsMapper.fromAmqp091(msg, ex);

    assert.equal(ex.in.getHeader('JMSMessageID'), 'ID:77');
    assert.equal(ex.in.getHeader('JMSCorrelationID'), 'corr-77');
    assert.equal(ex.in.getHeader('JMSTimestamp'), 1700000003000); // back to ms
    assert.equal(ex.in.getHeader('JMSType'), 'Pong');
    assert.equal(ex.in.getHeader('JMSDeliveryMode'), 'PERSISTENT');
    assert.equal(ex.in.getHeader('JMSPriority'), 7);
  });

  it('toAmqp10: skips unmapped headers gracefully', () => {
    const msg = {};
    JmsMapper.toAmqp10(makeExchange(), msg); // no JMS headers set
    assert.deepEqual(msg, { properties: {} });
  });
});

// ── AmqpComponent URI parsing ────────────────────────────────────────────────

describe('AmqpComponent URI parsing', () => {
  const ctx = new CamelContext();

  it('defaults to AMQP 1.0 when protocol param absent', () => {
    const comp = new AmqpComponent();
    const params = new URLSearchParams();
    const ep = comp.createEndpoint('amqp://localhost:5672/testqueue', '//localhost:5672/testqueue', params, ctx);
    assert.equal(ep.host, 'localhost');
    assert.equal(ep.port, 5672);
    assert.equal(ep.queue, 'testqueue');
    assert.equal(ep.jmsMapping, false);
    assert.match(ep.constructor.name, /Amqp10Endpoint/);
  });

  it('creates Amqp10Endpoint for protocol=1.0', () => {
    const comp = new AmqpComponent();
    const params = new URLSearchParams('protocol=1.0&jms=true');
    const ep = comp.createEndpoint('amqp://broker:5672/orders?protocol=1.0&jms=true', '//broker:5672/orders', params, ctx);
    assert.equal(ep.host, 'broker');
    assert.equal(ep.port, 5672);
    assert.equal(ep.queue, 'orders');
    assert.equal(ep.jmsMapping, true);
    assert.match(ep.constructor.name, /Amqp10Endpoint/);
  });

  it('creates Amqp091Endpoint for protocol=0-9-1', () => {
    const comp = new AmqpComponent();
    const params = new URLSearchParams('protocol=0-9-1');
    const ep = comp.createEndpoint('amqp://rabbit:5672/events?protocol=0-9-1', '//rabbit:5672/events', params, ctx);
    assert.equal(ep.queue, 'events');
    assert.match(ep.constructor.name, /Amqp091Endpoint/);
  });

  it('returns cached endpoint on duplicate URI', () => {
    const comp = new AmqpComponent();
    const params = new URLSearchParams();
    const ep1 = comp.createEndpoint('amqp://localhost:5672/q', '', params, ctx);
    const ep2 = comp.createEndpoint('amqp://localhost:5672/q', '', params, ctx);
    assert.equal(ep1, ep2);
  });
});

// ── Amqp10Producer unit test (mock container) ────────────────────────────────

describe('Amqp10Producer', () => {
  it('sends exchange body as AMQP 1.0 message via mock container', async () => {
    const sent = [];

    // Mock rhea container
    function mockFactory() {
      return {
        connect({ host, port }) {
          const listeners = {};
          const conn = {
            on(event, fn) { listeners[event] = fn; return conn; },
            once(event, fn) { listeners[event] = fn; return conn; },
            open_sender(queue) {
              // Emit 'sendable' asynchronously so the producer wires up first
              const senderListeners = {};
              const sender = {
                on(ev, fn) { senderListeners[ev] = fn; return sender; },
                send(msg) { sent.push({ queue, msg }); },
                close() {
                  // trigger connection_close after sender close
                  setTimeout(() => listeners['connection_close']?.(), 0);
                },
              };
              setTimeout(() => senderListeners['sendable']?.(), 0);
              return sender;
            },
            close() { /* trigger via sender.close above */ },
          };
          // Emit connection_open after a tick
          setTimeout(() => listeners['connection_open']?.(), 0);
          return conn;
        },
      };
    }

    const comp = new AmqpComponent();
    comp.setClientFactory10(mockFactory);

    const params = new URLSearchParams('protocol=1.0');
    const ctx = new CamelContext();
    const ep = comp.createEndpoint('amqp://localhost:5672/myqueue?protocol=1.0', '', params, ctx);
    const producer = ep.createProducer();

    const ex = makeExchange('hello from producer');
    await producer.send(ex);

    assert.equal(sent.length, 1);
    assert.equal(sent[0].queue, 'myqueue');
    assert.equal(sent[0].msg.body, 'hello from producer');
  });

  it('applies JMS mapping when jmsMapping=true', async () => {
    const sent = [];

    function mockFactory() {
      return {
        connect() {
          const listeners = {};
          const conn = {
            on(event, fn) { listeners[event] = fn; return conn; },
            once(event, fn) { listeners[event] = fn; return conn; },
            open_sender(queue) {
              const senderListeners = {};
              const sender = {
                on(ev, fn) { senderListeners[ev] = fn; return sender; },
                send(msg) { sent.push(msg); },
                close() { setTimeout(() => listeners['connection_close']?.(), 0); },
              };
              setTimeout(() => senderListeners['sendable']?.(), 0);
              return sender;
            },
            close() {},
          };
          setTimeout(() => listeners['connection_open']?.(), 0);
          return conn;
        },
      };
    }

    const comp = new AmqpComponent();
    comp.setClientFactory10(mockFactory);

    const params = new URLSearchParams('protocol=1.0&jms=true');
    const ctx = new CamelContext();
    const ep = comp.createEndpoint('amqp://localhost:5672/orders?protocol=1.0&jms=true', '', params, ctx);
    const producer = ep.createProducer();

    const ex = makeExchange('order payload');
    ex.in.setHeader('JMSMessageID', 'ID:order-001');
    ex.in.setHeader('JMSCorrelationID', 'sess-abc');
    ex.in.setHeader('JMSType', 'OrderCreated');

    await producer.send(ex);

    assert.equal(sent.length, 1);
    assert.equal(sent[0].properties.message_id, 'ID:order-001');
    assert.equal(sent[0].properties.correlation_id, 'sess-abc');
    assert.equal(sent[0].properties.subject, 'OrderCreated');
  });
});

// ── Amqp091Producer unit test (mock amqplib) ─────────────────────────────────

describe('Amqp091Producer', () => {
  it('sends exchange body as AMQP 0-9-1 message via mock connection', async () => {
    const sent = [];

    async function mockFactory(url) {
      return {
        async createChannel() {
          return {
            async assertQueue(q) {},
            sendToQueue(q, content, opts) { sent.push({ q, content: content.toString(), opts }); },
            async close() {},
          };
        },
        async close() {},
      };
    }

    const comp = new AmqpComponent();
    comp.setClientFactory091(mockFactory);

    const params = new URLSearchParams('protocol=0-9-1');
    const ctx = new CamelContext();
    const ep = comp.createEndpoint('amqp://localhost:5672/events?protocol=0-9-1', '', params, ctx);
    const producer = ep.createProducer();

    const ex = makeExchange('event payload');
    await producer.send(ex);

    assert.equal(sent.length, 1);
    assert.equal(sent[0].q, 'events');
    assert.equal(sent[0].content, 'event payload');
  });
});

// ── Amqp10Consumer unit test (mock container — lifecycle + message dispatch) ──

describe('Amqp10Consumer', () => {
  it('delivers message to pipeline and closes cleanly on stop()', async () => {
    const processed = [];

    // Minimal mock pipeline
    const pipeline = {
      async run(exchange) { processed.push(exchange.in.body); },
    };

    let capturedMessageHandler = null;
    let capturedCloseHandler = null;

    function mockFactory() {
      return {
        connect() {
          const listeners = {};
          const conn = {
            on(event, fn) {
              listeners[event] = fn;
              if (event === 'message') capturedMessageHandler = fn;
              if (event === 'connection_close') capturedCloseHandler = fn;
              return conn;
            },
            once(event, fn) {
              listeners['__once_' + event] = fn;
              if (event === 'connection_close') capturedCloseHandler = fn;
              if (event === 'disconnected') {
                // noop
              }
              return conn;
            },
            open_receiver(queue) { return {}; },
            close() {
              // Simulate broker confirming close
              setTimeout(() => {
                const h = listeners['__once_connection_close'] ?? listeners['connection_close'];
                if (h) h();
              }, 0);
            },
          };
          // Emit connection_open after a tick
          setTimeout(() => listeners['connection_open']?.(), 0);
          return conn;
        },
      };
    }

    const comp = new AmqpComponent();
    comp.setClientFactory10(mockFactory);

    const params = new URLSearchParams('protocol=1.0');
    const ctx = new CamelContext();
    const ep = comp.createEndpoint('amqp://localhost:5672/testq?protocol=1.0', '', params, ctx);
    const consumer = ep.createConsumer(pipeline);

    await consumer.start();

    // Simulate an incoming AMQP 1.0 message
    assert.ok(capturedMessageHandler, 'message handler should be registered');
    capturedMessageHandler({ message: { body: 'incoming message', properties: {} } });

    // Give async pipeline.run() time to execute
    await new Promise(r => setTimeout(r, 10));

    assert.equal(processed.length, 1);
    assert.equal(processed[0], 'incoming message');

    await consumer.stop();
    // Verify: context consumer cleared
    assert.equal(ctx.getConsumer('amqp://localhost:5672/testq?protocol=1.0'), null);
  });

  it('fromAmqp10 JMS mapping applied when jmsMapping=true', async () => {
    const exchanges = [];

    const pipeline = { async run(ex) { exchanges.push(ex); } };
    let capturedMessageHandler = null;

    function mockFactory() {
      return {
        connect() {
          const listeners = {};
          const conn = {
            on(ev, fn) {
              listeners[ev] = fn;
              if (ev === 'message') capturedMessageHandler = fn;
              return conn;
            },
            once(ev, fn) { listeners['__once_' + ev] = fn; return conn; },
            open_receiver() { return {}; },
            close() {
              setTimeout(() => {
                const h = listeners['__once_connection_close'] ?? listeners['connection_close'];
                if (h) h();
              }, 0);
            },
          };
          setTimeout(() => listeners['connection_open']?.(), 0);
          return conn;
        },
      };
    }

    const comp = new AmqpComponent();
    comp.setClientFactory10(mockFactory);

    const params = new URLSearchParams('protocol=1.0&jms=true');
    const ctx = new CamelContext();
    const ep = comp.createEndpoint('amqp://localhost:5672/orders?protocol=1.0&jms=true', '', params, ctx);
    const consumer = ep.createConsumer(pipeline);

    await consumer.start();
    capturedMessageHandler({
      message: {
        body: 'order data',
        properties: { message_id: 'ID:xyz', subject: 'OrderEvent' },
        header: {},
      },
    });

    await new Promise(r => setTimeout(r, 10));

    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0].in.getHeader('JMSMessageID'), 'ID:xyz');
    assert.equal(exchanges[0].in.getHeader('JMSType'), 'OrderEvent');

    await consumer.stop();
  });
});

// ── Amqp091Consumer unit test ────────────────────────────────────────────────

describe('Amqp091Consumer', () => {
  it('delivers message to pipeline and closes cleanly on stop()', async () => {
    const processed = [];
    const pipeline = { async run(exchange) { processed.push(exchange.in.body); } };

    let capturedConsumeHandler = null;

    async function mockFactory() {
      return {
        async createChannel() {
          return {
            async assertQueue() {},
            consume(queue, handler) { capturedConsumeHandler = handler; },
            ack() {},
            async close() {},
          };
        },
        async close() {},
      };
    }

    const comp = new AmqpComponent();
    comp.setClientFactory091(mockFactory);

    const params = new URLSearchParams('protocol=0-9-1');
    const ctx = new CamelContext();
    const ep = comp.createEndpoint('amqp://localhost:5672/q091?protocol=0-9-1', '', params, ctx);
    const consumer = ep.createConsumer(pipeline);

    await consumer.start();

    // Simulate incoming message
    assert.ok(capturedConsumeHandler, 'consume handler should be registered');
    capturedConsumeHandler({
      content: Buffer.from('hello 0-9-1'),
      properties: {},
    });

    await new Promise(r => setTimeout(r, 10));

    assert.equal(processed.length, 1);
    assert.equal(processed[0], 'hello 0-9-1');

    await consumer.stop();
    assert.equal(ctx.getConsumer('amqp://localhost:5672/q091?protocol=0-9-1'), null);
  });
});

// ── Integration test (conditional on AMQP_URL) ───────────────────────────────

const AMQP_URL = process.env.AMQP_URL;
const AMQP_PROTOCOL = process.env.AMQP_PROTOCOL ?? '1.0';

if (AMQP_URL) {
  describe('AMQP integration (live broker)', () => {
    it('round-trips a message through a live AMQP broker', async () => {
      // Parse URL for component
      const url = new URL(AMQP_URL);
      const host = url.hostname;
      const port = url.port || 5672;
      const queue = 'camel-lite-test-' + Date.now();
      const endpointUri = `amqp://${host}:${port}/${queue}?protocol=${AMQP_PROTOCOL}`;

      const received = [];
      const context = new CamelContext();
      const amqp = new AmqpComponent();
      context.addComponent('amqp', amqp);

      class TestRoutes extends RouteBuilder {
        configure(ctx) {
          this.from(endpointUri).process((ex) => { received.push(ex.in.body); });
        }
      }

      context.addRoutes(new TestRoutes());
      await context.start();

      // Send a message via producer
      const params = new URLSearchParams(`protocol=${AMQP_PROTOCOL}`);
      const endpoint = amqp.createEndpoint(endpointUri, '', params, context);
      const producer = endpoint.createProducer();

      const ex = new Exchange();
      ex.in.body = 'integration test message';
      await producer.send(ex);

      // Wait for consumer to receive
      await new Promise(r => setTimeout(r, 500));

      await context.stop();

      assert.ok(received.length >= 1, 'should have received at least one message');
      assert.equal(received[0], 'integration test message');
    });
  });
} else {
  describe('AMQP integration (skipped — set AMQP_URL to enable)', () => {
    it('skipped', () => { /* no-op */ });
  });
}
