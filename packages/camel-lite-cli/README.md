# camel-lite-cli

Command-line runtime for camel-lite. Load a route definition file and optionally inject a single message into the first `from:` endpoint.

## Install

```sh
npm install -g camel-lite-cli
```

## Usage

```sh
# Run a route file (daemon mode implied — exits when the route finishes)
camel-lite -r route.yaml

# Inject a JSON body and exit
camel-lite -r route.yaml -i '{"name":"world"}'

# Read the message body from stdin
camel-lite -r route.yaml -i -

# Read the route definition from stdin, inject a literal string body
cat route.yaml | camel-lite -r - -i body

# Daemon mode — keep running after the initial message (timer/cron/seda routes)
camel-lite -r route.yaml -d

# JSON-structured log output
camel-lite -l json -r route.yaml
```

## Options

| Flag | Long form | Description | Default |
|------|-----------|-------------|---------|
| `-r` | `--routes` | Path to route definition file (`.yaml`, `.yml`, `.json`), or `-` to read from stdin | *(required)* |
| `-i` | `--input` | Message body to inject into the first `from:` endpoint. Accepts a JSON string, a plain string, or `-` to read from stdin | *(none)* |
| `-d` | `--daemon` | Keep the process running after the initial dispatch. Use for timer/cron/seda-driven routes | `false` |
| `-l` | `--log-mode` | Log output format: `pretty` (human-readable) or `json` (structured) | `pretty` |
| `-v` | `--version` | Print the CLI version and exit | — |

## Notes

- All 13 camel-lite components are pre-loaded. Components whose external broker or service is unreachable at startup are skipped gracefully — the route still starts for the components that are available.
- `-r` and `-i` cannot both be `-` simultaneously. Only one of the two can read from stdin at a time.
- Route files are loaded via `RouteLoader.loadFile()`. `.yaml` / `.yml` / `.json` extensions are recognised; other extensions trigger content-sniffing.
- Without `-d`, the process exits after the first message completes its route (or immediately if no `-i` is provided and the route has no self-triggering source).

## See Also

- [camel-lite root README](../../README.md)
