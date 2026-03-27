# boot-camel-lite-extras-starter

Extends `boot-camel-lite-starter` with CDI auto-configuration for the four broker-backed and coordination components: `amqp`, `sql`, `nosql` (MongoDB), and `master` (leader election).

## Install

```sh
npm install boot-camel-lite-extras-starter
```

`boot-camel-lite-starter` is a peer dependency and must be installed alongside it.

## Configuration

All keys are nested under `boot.camel-lite`. Each extra component can be individually disabled.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `boot.camel-lite.amqp.enabled` | boolean | `true` | Register the `amqp:` component bean |
| `boot.camel-lite.sql.enabled` | boolean | `true` | Register the `sql:` component bean |
| `boot.camel-lite.nosql.enabled` | boolean | `true` | Register the `nosql:` component bean |
| `boot.camel-lite.master.enabled` | boolean | `true` | Register the `master:` component bean |

> **Note:** All component connection parameters (broker URLs, database URIs, backend selection, credentials) are URI-level options — not boot config level. For example: `amqp://myqueue?connectionUrl=amqp://localhost:5672`, `sql:query?dataSourceUrl=...`, `nosql:collection?uri=mongodb://localhost`. See each component's README for full URI option reference.

## Usage

```js
import { camelLiteExtrasStarter } from 'boot-camel-lite-extras-starter';

const { applicationContext } = await camelLiteExtrasStarter({ config: cfg });

const ctx = applicationContext.get('camelLiteContext');
await ctx.ready();

const pt = applicationContext.get('camelProducerTemplate');
await pt.sendBody('direct:start', { event: 'hello' });
```

The entry function `camelLiteExtrasStarter(options)` initialises both the core starter beans and the extras component beans in a single pass.

## See Also

- [camel-lite root README](../../README.md)
- [boot-camel-lite-starter README](../boot-camel-lite-starter/README.md)
