# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-03-29

### Fixed

- Version collision: bumped all packages from `1.1.0` to `1.1.1` to allow clean npm publish

### Changed

- Dropped Node.js 20 from CI matrix — `node:sqlite` (`DatabaseSync`) requires Node 22.5+
- Added `engines: { "node": ">=22.5.0" }` to root `package.json`

## [1.1.0] - 2026-03-28

### Added

#### CLI (`camel-lite-cli`)

- `--verbose` — restores info-level framework logging on stderr (default: suppressed)
- `--debug` — restores debug-level framework logging on stderr; takes precedence over `--verbose`
- `-p`, `--producer-uri <uri>` — override the ProducerTemplate target URI; requires `-i`
- `--exchange-pattern <InOnly|i|InOut|io>` — select fire-and-forget (`InOnly`, `i`) or request-reply (`InOut`, `io`); case-insensitive; defaults to `InOnly`; reply body printed to stdout for `InOut`
- `-c`, `--consumer-uri <uri>` — poll a consumer URI in a daemon loop, printing each message body to stdout; implies daemon mode; mutually exclusive with `-i` and `-p`
- User config discovery: `ProfileConfigLoader.load({ basePath: ~/.camel-lite })` loads `application.yaml` / `application.json` from the user's home config directory on every invocation
- Silent-by-default: all framework logging suppressed via `EphemeralConfig` overlay (`logging.level./: off`); zero stderr output unless `--verbose` or `--debug` is set
- Boot banner suppressed unconditionally

#### Core (`camel-lite-core`)

- `PollingConsumerAdapter` — wraps any push-consumer in an internal `BufferQueue`, making it pollable via `ConsumerTemplate`; enables `ConsumerTemplate` to receive from any URI scheme, not only `seda:`
- `CamelContext.pollingUris` — `Set<string>` property; URIs in this set are wrapped with `PollingConsumerAdapter` when the context starts
- `ConsumerTemplate` — removed scheme whitelist; any consumer with a native `poll()` method or registered via `pollingUris` is now supported

### Changed

#### CLI (`camel-lite-cli`)

- Runtime now uses `CdiCamelRuntime` (CDI boot stack via `camelLiteExtrasStarter`) as the sole execution path; all 12 component schemes are available without manual registration
- `components.js` deleted; component registration is handled entirely by `boot-camel-lite-extras-starter`
- Config composition: `PropertySourceChain([loggingOverlay, userConfig])` — logging overlay wins, user config applies underneath
- `CamelRuntime` re-exported from `src/index.js` as a backward-compatible alias for `CdiCamelRuntime`

## [1.0.2] - 2026-03-27

### Changed

- Scoped all package names to `@alt-javascript/` (e.g. `camel-lite-core` → `@alt-javascript/camel-lite-core`)
- Updated all cross-package imports and `devDependencies` to use scoped names

## [1.0.1] - 2026-03-27

### Fixed

- Added `repository` field to all publishable workspace packages — required for npm provenance validation
- Pinned workspace cross-dependencies to explicit version (`1.0.0`) instead of `*` to prevent npm resolving them as git SSH URLs outside the monorepo
- Added `author`, `contributors`, `keywords`, and `publishConfig` to all workspace packages
- CI publish workflow: removed non-existent `npm run build` step, added `--access public --provenance` flags and `id-token: write` permission

## [1.0.0] - 2026-03-27

### Added

#### Core (`camel-lite-core`)

- `CamelContext` — component registry, route lifecycle, consumer map, bean registry
- `RouteBuilder` — fluent DSL for building routes programmatically
- `RouteDefinition` — per-route DSL: `process`, `to`, `filter`, `transform`, `setBody`, `setHeader`, `setProperty`, `removeHeader`, `choice`/`when`/`otherwise`, `split`, `aggregate`, `marshal`, `unmarshal`, `convertBodyTo`, `bean`, `log`, `stop`, `deadLetterChannel`
- `Pipeline` — sequential processor chain with configurable error handling (redelivery, dead letter channel, `onException`)
- `Exchange` / `Message` — in/out message pair with headers, properties, and exception capture
- `ProducerTemplate` — high-level `sendBody(uri, body)` and `requestBody(uri, body)` APIs
- `ConsumerTemplate` — high-level `receiveBody(uri, timeoutMs)` polling API (seda: supported)
- `RouteLoader` — YAML and JSON route definition loader: `loadFile`, `loadString`, `loadStream`, `loadObject`
- Simple expression language: `${body}`, `${header.X}`, `${exchangeProperty.X}`, `${out.body}`, logical operators, contains, regex
- `js(code)` and `constant(value)` expression factories
- `AggregationStrategies` — built-in strategies: `useLatest`, `collect`, `sum`, `groupedExchange`
- `CycleDetectedError`, `CamelError`, `SedaQueueFullError`, `CamelFilterStopException` — typed errors

#### Components

- **`camel-lite-component-direct`** — synchronous in-process routing with cycle detection
- **`camel-lite-component-seda`** — async in-process queuing with configurable concurrency and queue size
- **`camel-lite-component-log`** — structured logging via `@alt-javascript/logger`; per-route logger name and level
- **`camel-lite-component-file`** — file read (consumer: poll directory) and write (producer: write exchange body)
- **`camel-lite-component-http`** — HTTP producer: GET/POST/PUT/DELETE with JSON body serialisation
- **`camel-lite-component-ftp`** — FTP producer and consumer via `basic-ftp`
- **`camel-lite-component-timer`** — periodic exchange trigger with `period`, `delay`, `repeatCount`; headers: `CamelTimerName`, `CamelTimerFiredTime`, `CamelTimerCounter`
- **`camel-lite-component-cron`** — cron-scheduled trigger via `node-cron`; 5- and 6-field expressions; timezone support; headers: `CamelCronName`, `CamelCronFiredTime`
- **`camel-lite-component-amqp`** — AMQP 1.0 (rhea) and AMQP 0-9-1 (amqplib) messaging; producer and consumer
- **`camel-lite-component-sql`** — SQL query and update via Node.js built-in `node:sqlite`; named and positional parameters
- **`camel-lite-component-nosql`** — NoSQL collection operations via `@alt-javascript/jsnosqlc`; insert, find, update, delete
- **`camel-lite-component-master`** — leader election with pluggable `LockStrategy` interface; three backends:
  - `FileLockStrategy` — exclusive file creation (default, zero external deps)
  - `ZooKeeperStrategy` — ZooKeeper ephemeral node via `node-zookeeper-client`
  - `ConsulStrategy` — Consul session + KV acquire via native `fetch`
  - Headers: `CamelMasterIsLeader`, `CamelMasterService`, `CamelMasterNodeId`

#### CLI (`camel-lite-cli`)

- `camel-lite -r <file|-> [-i <body|->] [-d] [-l text|json]`
- `-r` — route definition file (`.yaml`, `.yml`, `.json`) or `-` for stdin
- `-i` — message body to inject, or `-` for stdin (mutually exclusive with `-r -`)
- `-d` — daemon mode: keep context alive until `SIGINT`/`SIGTERM`
- `-l` — log output format: `text` (default, human-readable) or `json`
- All 13 components pre-registered; missing broker dependencies skip gracefully

#### Boot Starters

- **`boot-camel-lite-starter`** — `@alt-javascript/boot` CDI auto-configuration for core + direct/seda/log/file/http/ftp/timer/cron:
  - `CamelLiteContext` CDI bean — wraps `CamelContext` with async `init()`/`ready()`/`destroy()`
  - `RouteRegistry` CDI bean — auto-discovers CDI `RouteBuilder` beans (duck-typed `configure(ctx)`); loads `boot.camel-lite.routes[n].definition` objects via `RouteLoader.loadObject()`
  - Per-scheme `ConfiguredComponent` CDI beans, each gated by `boot.camel-lite.<scheme>.enabled` (default: `true`)
  - `camelProducerTemplate` and `camelConsumerTemplate` CDI beans
  - `camelLiteStarter(options)` entry function
- **`boot-camel-lite-extras-starter`** — extends core starter with amqp/sql/nosql/master components
  - `camelLiteExtrasStarter(options)` entry function

#### Observability

- All log categories follow the `@alt-javascript/camel-lite/<ClassName>` idiom
- INFO level: context start/stop, route registration, leader election, component registration
- DEBUG level: per-message dispatch, timer fires, cron ticks, lock renewal
- WARN level: lock acquire failure, missing component, stop cleanup error
- Exchange error captured in `exchange.exception` — pipeline continues to dead letter channel if configured

[Unreleased]: https://github.com/alt-javascript/camel-lite/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/alt-javascript/camel-lite/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/alt-javascript/camel-lite/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/alt-javascript/camel-lite/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/alt-javascript/camel-lite/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/alt-javascript/camel-lite/releases/tag/v1.0.0
