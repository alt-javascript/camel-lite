# camel-lite

[![Language](https://img.shields.io/badge/language-JavaScript-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0-green.svg)](CHANGELOG.md)

An [Apache Camel](https://camel.apache.org/)-inspired integration framework for pure JavaScript — Enterprise Integration Patterns, component-based routing, and a Spring Boot-style auto-configuration starter, all in ES modules with no TypeScript and no build step required.

## Why

Apache Camel is the gold standard for integration patterns in the Java ecosystem. If you want those same patterns in a pure JavaScript project — with no Java, no TypeScript, no build step, and no runtime dependencies beyond the Node.js standard library — `camel-lite` fills that gap.

It runs in Node.js 22+ as pure ESM. The boot starters bring it into the `@alt-javascript/boot` CDI ecosystem, giving you the same configuration-driven auto-wiring that Spring Boot provides for Camel in the Java world.

## Quick Start

```bash
npm install @alt-javascript/camel-lite-core @alt-javascript/camel-lite-component-direct @alt-javascript/camel-lite-component-log
```

```javascript
import { CamelContext, RouteBuilder } from '@alt-javascript/camel-lite-core';
import { DirectComponent } from '@alt-javascript/camel-lite-component-direct';
import { LogComponent } from '@alt-javascript/camel-lite-component-log';
import { ProducerTemplate } from '@alt-javascript/camel-lite-core';

const context = new CamelContext();
context.addComponent('direct', new DirectComponent());
context.addComponent('log', new LogComponent());

const builder = new RouteBuilder();
builder.from('direct:greet')
  .setBody(() => exchange => `Hello, ${exchange.in.body}!`)
  .to('log:greet');

context.addRoutes(builder);
await context.start();

const pt = new ProducerTemplate(context);
await pt.sendBody('direct:greet', 'world');  // logs: Hello, world!

await context.stop();
```

### With boot starter

```bash
npm install @alt-javascript/boot-camel-lite-starter @alt-javascript/boot @alt-javascript/cdi @alt-javascript/config
```

```javascript
import { camelLiteStarter } from '@alt-javascript/boot-camel-lite-starter';
import { EphemeralConfig } from '@alt-javascript/config';

const { applicationContext } = await camelLiteStarter({
  config: new EphemeralConfig({
    boot: {
      'camel-lite': {
        routes: [{
          definition: {
            route: {
              from: { uri: 'direct:hello', steps: [{ log: { simple: '${body}' } }] }
            }
          }
        }]
      }
    }
  })
});

const ctx = applicationContext.get('camelLiteContext');
await ctx.ready();

const pt = applicationContext.get('camelProducerTemplate');
await pt.sendBody('direct:hello', 'world');
```

### CLI

```bash
npm install -g @alt-javascript/camel-lite-cli

camel-lite -r route.yaml -i '{"name":"world"}'        # inject a message
camel-lite -r route.yaml -i body --exchange-pattern InOut  # request-reply
camel-lite -r route.yaml -p direct:ep -i body         # send to specific URI
camel-lite -r route.yaml -c seda:results              # consume and print
camel-lite -l json -r route.yaml                      # JSON log output
camel-lite -r route.yaml -d                           # daemon mode
camel-lite --verbose -r route.yaml                    # show framework logs
camel-lite --debug   -r route.yaml                    # full debug logs
```

## Packages

| Package | Description |
|---|---|
| [`camel-lite-core`](packages/camel-lite-core/README.md) | Core framework: `CamelContext`, `RouteBuilder`, `Exchange`, `Pipeline`, `ProducerTemplate`, `ConsumerTemplate`, `RouteLoader` |
| [`camel-lite-component-direct`](packages/camel-lite-component-direct/README.md) | Synchronous in-process endpoint — `direct:name` |
| [`camel-lite-component-seda`](packages/camel-lite-component-seda/README.md) | Async in-process queue endpoint — `seda:name?size=100&concurrentConsumers=2` |
| [`camel-lite-component-log`](packages/camel-lite-component-log/README.md) | Structured logging endpoint — `log:loggerName?level=info` |
| [`camel-lite-component-file`](packages/camel-lite-component-file/README.md) | File read/write endpoint — `file:/path?fileName=out.txt` |
| [`camel-lite-component-http`](packages/camel-lite-component-http/README.md) | HTTP producer endpoint — `http://host/path?method=POST` |
| [`camel-lite-component-ftp`](packages/camel-lite-component-ftp/README.md) | FTP producer/consumer endpoint — `ftp://host/dir?username=u&password=p` |
| [`camel-lite-component-timer`](packages/camel-lite-component-timer/README.md) | Periodic trigger — `timer:name?period=1000&delay=0&repeatCount=0` |
| [`camel-lite-component-cron`](packages/camel-lite-component-cron/README.md) | Cron-scheduled trigger — `cron:name?schedule=0 * * * * *` |
| [`camel-lite-component-amqp`](packages/camel-lite-component-amqp/README.md) | AMQP 1.0 and 0-9-1 messaging — `amqp:queue:name?protocol=amqp10` |
| [`camel-lite-component-sql`](packages/camel-lite-component-sql/README.md) | SQL query/update endpoint — `sql:SELECT * FROM users?url=jsdbc:sqlite::memory:` |
| [`camel-lite-component-nosql`](packages/camel-lite-component-nosql/README.md) | NoSQL collection endpoint — `nosql:collection?url=jsnosqlc:memory:&operation=insert` |
| [`camel-lite-component-master`](packages/camel-lite-component-master/README.md) | Leader election — `master:service?backend=file\|zookeeper\|consul` |
| [`camel-lite-cli`](packages/camel-lite-cli/README.md) | Command-line runtime — `camel-lite -r route.yaml [-i body] [-p uri] [-c uri] [--exchange-pattern InOnly\|InOut] [-d] [--verbose\|--debug]` |
| [`boot-camel-lite-starter`](packages/boot-camel-lite-starter/README.md) | `@alt-javascript/boot` auto-configuration: core + direct/seda/log/file/http/ftp/timer/cron |
| [`boot-camel-lite-extras-starter`](packages/boot-camel-lite-extras-starter/README.md) | Boot auto-configuration: amqp/sql/nosql/master |

## Configuration

All components accept configuration via URI parameters. The boot starters additionally support `@alt-javascript/config` properties under the `boot.camel-lite.*` prefix:

```yaml
boot:
  camel-lite:
    direct:
      enabled: true       # default: true for all bundled schemes
    seda:
      enabled: true
    routes:
      - definition:
          route:
            from:
              uri: direct:hello
              steps:
                - log:
                    simple: "${body}"
```

CDI `RouteBuilder` beans are auto-discovered — any CDI bean with a `configure(camelContext)` method is treated as a route builder.

## License

MIT — see [LICENSE](LICENSE).

## Apache Camel Attribution

The design of `camel-lite` is modelled on [Apache Camel](https://camel.apache.org/).

Specific concepts ported from Apache Camel:

| Apache Camel concept | camel-lite equivalent |
|---|---|
| `CamelContext` | `CamelContext` — component registry, route lifecycle, consumer map |
| `Component` / `Endpoint` / `Producer` / `Consumer` factory chain | Same three-tier factory chain — `createEndpoint` → `createProducer` / `createConsumer` |
| `Exchange` / `Message` (in/out) | `Exchange` / `Message` — same in/out pattern, headers, properties, exception |
| `RouteBuilder` / `RouteDefinition` | `RouteBuilder` / `RouteDefinition` — fluent DSL, `from(...).process(...).to(...)` |
| `ProducerTemplate` / `ConsumerTemplate` | `ProducerTemplate` / `ConsumerTemplate` — high-level send/receive APIs |
| `Pipeline` | `Pipeline` — sequential processor chain with error handling and redelivery |
| URI-based endpoint addressing | Same scheme: `direct:name`, `seda:name?size=100`, `timer:tick?period=1000` |
| `direct:` component (synchronous in-process) | `camel-lite-component-direct` |
| `seda:` component (async in-process queue) | `camel-lite-component-seda` |
| `timer:` component (periodic trigger) | `camel-lite-component-timer` |
| `file:` / `ftp:` / `http:` components | `camel-lite-component-file` / `ftp` / `http` |
| `log:` component | `camel-lite-component-log` |
| `sql:` component | `camel-lite-component-sql` (Node.js built-in `node:sqlite`) |
| `amqp:` component | `camel-lite-component-amqp` (AMQP 1.0 + 0-9-1) |
| NoSQL component | `camel-lite-component-nosql` (jsnosqlc) |
| `master:` component (leader election) | `camel-lite-component-master` (file, ZooKeeper, Consul backends) |
| Cron-triggered routes | `camel-lite-component-cron` (node-cron) |
| EIP: Message Filter | `RouteDefinition.filter(predicate)` |
| EIP: Content-Based Router | `RouteDefinition.choice().when(...).otherwise()` |
| EIP: Message Translator | `RouteDefinition.transform(expr)` / `setBody(expr)` |
| EIP: Splitter | `RouteDefinition.split(expr)` |
| EIP: Aggregator | `RouteDefinition.aggregate(expr, strategy)` |
| EIP: Dead Letter Channel | `RouteDefinition.deadLetterChannel(uri)` |
| Simple expression language | `simple('${body}')`, `simple('${header.X}')` |
| YAML/JSON route definitions | `RouteLoader.loadFile()` / `loadString()` / `loadStream()` / `loadObject()` |
| Spring Boot auto-configuration | `boot-camel-lite-starter` / `boot-camel-lite-extras-starter` |

Apache Camel is copyright The Apache Software Foundation. `camel-lite` is an independent JavaScript port and is 
not affiliated with, endorsed by, or associated with the Apache Software Foundation or 
the Apache Camel project.
