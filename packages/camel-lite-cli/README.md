# camel-lite-cli

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

Command-line runtime for camel-lite. Load a route definition and run it — inject a single message, receive messages from a URI, or keep the context alive in daemon mode.

## Install

```sh
npm install -g @alt-javascript/camel-lite-cli
```

## Quick Start

```sh
# Run a route file silently
camel-lite -r route.yaml

# Inject a JSON body and print any reply
camel-lite -r route.yaml -i '{"name":"world"}'

# Keep a timer route running until Ctrl-C
camel-lite -r timer-route.yaml -d

# Consume messages from a URI and print each body to stdout
camel-lite -r route.yaml -c seda:orders

# Show framework logs while debugging a route
camel-lite --debug -r route.yaml -i '{"name":"world"}'
```

## Usage

```
camel-lite -r <file|-> [options]
```

### Required

| Flag | Description |
|------|-------------|
| `-r`, `--routes <file\|->` | Route definition file (`.yaml`, `.yml`, `.json`) or `-` to read from stdin |

### Input / Output

| Flag | Description | Default |
|------|-------------|---------|
| `-i`, `--input <body\|->` | Message body to inject into the first `from:` endpoint. Accepts a JSON string, a plain string, or `-` to read from stdin | *(none — no message sent)* |
| `-p`, `--producer-uri <uri>` | Override the target endpoint URI for `-i`. Requires `-i`. Default: the first route's `from:` URI | *(first route `from:` URI)* |
| `--exchange-pattern <pattern>` | `InOnly` or `i` — fire-and-forget (exit after send). `InOut` or `io` — request-reply (prints reply body to stdout). Case-insensitive. | `InOnly` |
| `-c`, `--consumer-uri <uri>` | Poll a consumer URI in a daemon loop, printing each message body to stdout. Implies daemon mode. Mutually exclusive with `-i` and `-p` | *(none)* |

### Runtime Behaviour

| Flag | Description | Default |
|------|-------------|---------|
| `-d`, `--daemon` | Keep the context alive until `SIGINT`/`SIGTERM`. Use for timer, cron, and seda-driven routes | `false` |
| `-l`, `--log-mode <text\|json>` | Log output format: `text` (human-readable) or `json` (structured JSON objects) | `text` |

### Logging

By default, all camel-lite and boot framework log output is suppressed — the CLI is pipe-friendly and produces zero stderr output unless a flag is set.

| Flag | Description |
|------|-------------|
| `--verbose` | Enable info-level framework logging on stderr |
| `--debug` | Enable debug-level framework logging on stderr. Takes precedence over `--verbose` |

### Other

| Flag | Description |
|------|-------------|
| `-v`, `--version` | Print the CLI version and exit |
| `-h`, `--help` | Print help and exit |

## Flag Constraints

- `-r -` and `-i -` are mutually exclusive: only one argument can read from stdin.
- `-p` requires `-i`. Specifying a producer URI without a body to send is an error.
- `-c` is mutually exclusive with `-i` and `-p`. Consumer mode and producer mode are separate operations.
- `--exchange-pattern` accepts `InOnly`, `i`, `InOut`, or `io` (case-insensitive). Any other value is an error.

## Examples

### Fire-and-forget message

```sh
camel-lite -r route.yaml -i '{"order":"ABC-1","qty":5}'
```

Sends the JSON body to the first route's `from:` URI. Exits after the route completes. No output unless the route writes to stdout.

### Request-reply (InOut)

```sh
camel-lite -r transform-route.yaml -i 'hello' --exchange-pattern InOut
```

Sends `hello`, waits for the reply, and prints the reply body to stdout.

### Send to a specific endpoint

```sh
camel-lite -r route.yaml -i '{"event":"login"}' -p seda:audit
```

Sends the body to `seda:audit` instead of the route's default `from:` URI.

### Read route and body from stdin

```sh
# Route from stdin, body as argument
cat route.yaml | camel-lite -r - -i '{"name":"world"}'

# Route as argument, body from stdin
echo '{"name":"world"}' | camel-lite -r route.yaml -i -
```

### Daemon mode

```sh
camel-lite -r cron-route.yaml -d
```

Keeps the context running. Press Ctrl-C or send `SIGTERM` to stop.

### Consumer daemon

```sh
camel-lite -r route.yaml -c timer:tick?period=1000
```

Polls `timer:tick` in a loop. Each message body is printed to stdout on a new line. Runs until `SIGINT` or `SIGTERM`.

```sh
camel-lite -r route.yaml -c seda:results | tee results.log
```

Pipe consumer output to another tool — the CLI writes one body per line to stdout.

### Logging

```sh
# Show info-level framework logs (route registration, context start/stop)
camel-lite --verbose -r route.yaml -i body

# Show debug-level logs (per-message dispatch, timer fires, lock renewal)
camel-lite --debug -r route.yaml -i body

# --debug wins when both are present
camel-lite --debug --verbose -r route.yaml -i body

# JSON-structured log lines (combine with --verbose or --debug)
camel-lite --verbose -l json -r route.yaml -i body
```

### Missing home config directory

If `~/.camel-lite/` does not exist, the CLI starts silently with no user config. No error is thrown.

## User Configuration

The CLI loads `application.yaml` (or `application.json`) from `~/.camel-lite/` on every invocation. Place component connection strings, default log levels, or any `boot.camel-lite.*` properties there.

```
~/.camel-lite/
  application.yaml
```

Example `~/.camel-lite/application.yaml`:

```yaml
boot:
  camel-lite:
    amqp:
      url: amqp://localhost:5672
      username: guest
      password: guest
```

Values in `~/.camel-lite/application.yaml` are overridden by the CLI's own `EphemeralConfig` overlay (logging level, banner suppression), and can themselves be overridden by environment variables loaded through the same config chain.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Validation error (bad flags), route error, or unhandled exception |

Error messages are written to stderr in the format `camel-lite: error: <message>`.

## Troubleshooting

**No output in silent mode is expected.** All framework log lines are suppressed by default. Use `--verbose` or `--debug` to see what the route is doing.

**`camel-lite: error: -r / --routes is required`** — The `-r` flag is mandatory. Every invocation must specify a route definition file.

**`camel-lite: error: -p / --producer-uri requires -i / --input`** — You specified a target URI with `-p` but did not provide a body to send. Add `-i <body>`.

**`camel-lite: error: -c / --consumer-uri is mutually exclusive with -i / --input`** — Consumer mode (`-c`) and producer mode (`-i`) cannot be combined. Choose one.

**`camel-lite: fatal: <message>`** — An unhandled exception occurred during CDI boot or route execution. Run with `--debug` to see the full log trace leading up to the error.

**Route exits immediately without processing** — Without `-d` or `-c`, the context stops as soon as the initial message (if any) completes. Add `-d` for timer, cron, or seda-driven routes that need to stay alive.

## Runtime Architecture

The CLI uses a full CDI boot stack for every invocation:

1. `EphemeralConfig` overlay is constructed with the computed log level and banner suppression.
2. User config is loaded synchronously from `~/.camel-lite/` via `ProfileConfigLoader`.
3. A `PropertySourceChain` is composed: overlay (highest priority) → user config.
4. `Boot.boot({ config })` initialises the CDI container with the chained config.
5. `camelLiteExtrasStarter` registers all 12 component schemes into the CDI context.
6. `CdiCamelRuntime` loads the route definition and starts the `CamelContext`.
7. `ProducerTemplate` or `ConsumerTemplate` performs the requested operation.
8. The context is stopped (unless `-d` or `-c` keeps it alive).

All 12 camel-lite component schemes are pre-loaded. Components whose external broker or service is unavailable at startup fail gracefully — the route starts with the available components.

## See Also

- [camel-lite root README](../../README.md)
- [camel-lite-core](../camel-lite-core/README.md) — `CamelContext`, `RouteBuilder`, `ProducerTemplate`, `ConsumerTemplate`
- [boot-camel-lite-starter](../boot-camel-lite-starter/README.md) — CDI auto-configuration for core + 8 components
- [boot-camel-lite-extras-starter](../boot-camel-lite-extras-starter/README.md) — CDI auto-configuration for amqp/sql/nosql/master
