# example-boot-camel-lite-hono

An example integrating `boot-camel-lite-extras-starter` with `@alt-javascript/boot-hono` to show:

- Hono REST endpoint (`POST /message`) forwarding requests into camel-lite via `ProducerTemplate`
- A `timer:heartbeat` route firing every 5 seconds
- A `master:example-app` route logging leader election status

## Run

```bash
npm install
npm start
```

## Test

```bash
# Health check
curl http://localhost:3000/

# Send a message
curl -X POST http://localhost:3000/message \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello from Hono"}'
```

## Architecture

```
HTTP POST /message
    └─► MessageController.receive()
          └─► camelProducerTemplate.sendBody('direct:inbound', body)
                └─► direct:inbound route (CamelRoutes.configure)
                      └─► logs body, returns exchange

timer:heartbeat?period=5000  →  logs tick counter every 5s
master:example-app?backend=file  →  logs leader election on state change
```

## Routes (`src/CamelRoutes.js`)

| URI | Description |
|-----|-------------|
| `direct:inbound` | Receives messages from the REST controller |
| `timer:heartbeat?period=5000` | Fires every 5 seconds, logs counter |
| `master:example-app?backend=file&pollInterval=3000` | Leader election via file lock |

## Config (`config/default.yaml`)

```yaml
server:
  port: 3000
boot:
  camel-lite:
    direct.enabled: true
    timer.enabled: true
    master.enabled: true
    amqp.enabled: false   # disabled — no broker needed for this example
    sql.enabled: false
    nosql.enabled: false
```

## See Also

- [Root README](../../README.md)
- [boot-camel-lite-extras-starter](../boot-camel-lite-extras-starter/README.md)
- [boot-camel-lite-starter](../boot-camel-lite-starter/README.md)
