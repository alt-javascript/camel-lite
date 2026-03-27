class Component {
  createEndpoint(uri, remaining, parameters, context) {
    throw new Error('Not implemented');
  }
}

class Endpoint {
  createProducer() {
    throw new Error('Not implemented');
  }

  createConsumer(processor) {
    throw new Error('Not implemented');
  }
}

class Producer {
  async send(exchange) {
    throw new Error('Not implemented');
  }
}

class Consumer {
  async start() {
    throw new Error('Not implemented');
  }

  async stop() {
    throw new Error('Not implemented');
  }
}

export { Component, Endpoint, Producer, Consumer };
