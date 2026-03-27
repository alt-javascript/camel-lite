# boot-camel-lite-starter

`@alt-javascript/boot` CDI auto-configuration for camel-lite core plus the eight most common components: `direct`, `seda`, `log`, `file`, `http`, `ftp`, `timer`, and `cron`.

## Install

```sh
npm install boot-camel-lite-starter @alt-javascript/boot @alt-javascript/cdi @alt-javascript/config
```

## CDI Beans Registered

| Bean name | Type | Description |
|-----------|------|-------------|
| `camelLiteContext` | `CamelContext` | The running Camel context |
| `routeRegistry` | `RouteRegistry` | Scans config + CDI for routes and loads them into the context |
| `camelComponent.direct` | `DirectComponent` | `direct:` scheme |
| `camelComponent.seda` | `SedaComponent` | `seda:` scheme |
| `camelComponent.log` | `LogComponent` | `log:` scheme |
| `camelComponent.file` | `FileComponent` | `file:` scheme |
| `camelComponent.http` | `HttpComponent` | `http:`/`https:` scheme (producer only) |
| `camelComponent.ftp` | `FtpComponent` | `ftp:` scheme |
| `camelComponent.timer` | `TimerComponent` | `timer:` scheme |
| `camelComponent.cron` | `CronComponent` | `cron:` scheme |
| `camelProducerTemplate` | `ProducerTemplate` | Send messages programmatically |
| `camelConsumerTemplate` | `ConsumerTemplate` | Poll endpoints programmatically |

## Configuration

All keys are nested under `boot.camel-lite`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `boot.camel-lite.<scheme>.enabled` | boolean | `true` | Set to `false` to skip registering that component bean |
| `boot.camel-lite.routes[n].definition` | object | — | An already-parsed route definition object (equivalent to a parsed YAML route file) |

### Config route definition example

```yaml
boot:
  camel-lite:
    routes:
      - definition:
          - from: "direct:hello"
            steps:
              - log: "${body}"
              - to: "direct:world"
```

`@alt-javascript/config` deserialises this at load time; the starter passes it to `RouteLoader.loadObject()` to avoid a double-parse.

## Usage

```js
import { camelLiteStarter } from 'boot-camel-lite-starter';

const { applicationContext } = await camelLiteStarter({ config: cfg });

const ctx = applicationContext.get('camelLiteContext');
await ctx.ready();

const pt = applicationContext.get('camelProducerTemplate');
await pt.sendBody('direct:hello', 'world');
```

## CDI RouteBuilder Discovery

Any CDI bean that exposes a `configure(camelContext)` method is treated as a RouteBuilder and discovered automatically by `RouteRegistry`. No explicit registration is required — declare the bean in your CDI config array and give it a `configure` method:

```js
class GreetingRoutes {
  configure(camelContext) {
    camelContext
      .from('direct:greet')
      .log('${body}');
  }
}
```

## See Also

- [camel-lite root README](../../README.md)
- [boot-camel-lite-extras-starter README](../boot-camel-lite-extras-starter/README.md)
