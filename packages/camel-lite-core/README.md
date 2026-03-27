# camel-lite-core

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

Core framework for camel-lite — the `CamelContext`, routing DSL, `Exchange`, `Pipeline`, `ProducerTemplate`, `ConsumerTemplate`, and `RouteLoader`.

## Install

```bash
npm install camel-lite-core
```

## Quick Start

```javascript
import { CamelContext, RouteBuilder, ProducerTemplate } from 'camel-lite-core';
import { DirectComponent } from 'camel-lite-component-direct';

const context = new CamelContext();
context.addComponent('direct', new DirectComponent());

const builder = new RouteBuilder();
builder.from('direct:hello')
  .process(ex => { ex.in.body = `Hello, ${ex.in.body}!`; });

context.addRoutes(builder);
await context.start();

const pt = new ProducerTemplate(context);
const exchange = await pt.sendBody('direct:hello', 'world');
console.log(exchange.in.body); // Hello, world!

await context.stop();
```

## RouteDefinition DSL

| Method | Description |
|---|---|
| `process(fn\|obj)` | Run a processor — `async fn(exchange)` or `{ process(exchange) }` |
| `to(uri)` | Send to another endpoint |
| `filter(expr)` | Stop processing if predicate returns false |
| `transform(expr)` | Replace body with expression result |
| `setBody(expr)` | Set `exchange.in.body` |
| `setHeader(name, expr)` | Set a header |
| `setProperty(name, expr)` | Set an exchange property |
| `removeHeader(name)` | Remove a header |
| `choice()` | Content-based router — `.when(expr).to(uri)…​.otherwise().to(uri).end()` |
| `split(expr)` | Split body into sub-exchanges |
| `aggregate(expr, strategy)` | Aggregate sub-exchanges |
| `marshal(format)` | Serialise body (default: `json`) |
| `unmarshal(format)` | Deserialise body |
| `convertBodyTo(type)` | Convert body type |
| `bean(name)` | Invoke named bean from context |
| `log(expr)` | Log expression result |
| `stop()` | Stop processing |
| `deadLetterChannel(uri)` | Route failed exchanges to this URI |
| `onException(ErrorClass)` | Handle a specific exception type |

## Expressions

```javascript
import { simple, js, constant } from 'camel-lite-core';

simple('${body}')                    // exchange body
simple('${header.X-Auth}')           // header value
simple('${exchangeProperty.key}')    // exchange property
js('exchange.in.body.toUpperCase()') // arbitrary JS via new Function()
constant('fixed value')              // literal constant
```

**Note:** `simple()` does not support mixed literal + token strings (e.g. `'Prefix: ${body}'`). Use `js()` or a `process()` step for string building. See [ADR-006](../../docs/adr/ADR-006.md).

## RouteLoader

```javascript
import { RouteLoader } from 'camel-lite-core';

// From file — extension auto-detects format (.yaml/.yml/.json); unknown → content-sniff
const builder = await RouteLoader.loadFile('routes.yaml');

// From readable stream — content-sniffed (use for stdin or HTTP responses)
const builder = await RouteLoader.loadStream(process.stdin);

// From string
const builder = RouteLoader.loadString(yamlOrJsonString);

// From already-parsed object (e.g. from @alt-javascript/config at boot time)
const builder = RouteLoader.loadObject({ route: { from: { uri: 'direct:x', steps: [] } } });
```

### YAML route format

```yaml
route:
  id: my-route
  from:
    uri: direct:hello
    steps:
      - setBody:
          simple: "${body}"
      - to: log:hello
      - choice:
          when:
            - simple: "${body} == 'ping'"
              to: direct:pong
          otherwise:
            to: direct:default
```

## ProducerTemplate

```javascript
const pt = new ProducerTemplate(context);

// InOnly — returns the exchange after completion
const exchange = await pt.sendBody('direct:hello', 'world', { 'X-Header': 'value' });

// InOut — returns the result body (exchange.out.body, fallback to exchange.in.body)
const result = await pt.requestBody('direct:hello', 'world');
```

## ConsumerTemplate

Polls from `seda:` endpoints. Direct: and other push-model endpoints are not supported.

```javascript
const ct = new ConsumerTemplate(context);

const exchange = await ct.receive('seda:work', 5000);   // Exchange or null on timeout
const body     = await ct.receiveBody('seda:work', 5000); // body or null on timeout
```

## Error Handling

```javascript
builder.from('direct:input')
  .onException(Error)
    .to('direct:errors')
    .end()
  .process(ex => { throw new Error('oops'); });
```

Configure redelivery via Pipeline options:

```javascript
import { Pipeline } from 'camel-lite-core';

new Pipeline(processors, {
  maximumRedeliveries: 3,
  redeliveryDelay: 1000,
  deadLetterUri: 'direct:dlq',
});
```

## See Also

- [Root README](../../README.md)
- [ADR-007: Component factory chain](../../docs/adr/ADR-007.md)
- [ADR-006: Expression language](../../docs/adr/ADR-006.md)
- [ADR-011: Route loading entry points](../../docs/adr/ADR-011.md)
