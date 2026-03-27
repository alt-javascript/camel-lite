[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

Leader election with pluggable lock-strategy backends. Only the elected leader receives exchanges — all non-leader nodes are suppressed. Headers indicate whether the current node holds the lease.

## Install

```sh
npm install camel-lite-component-master
```

## URI Syntax

```
master:serviceName[?backend=file&pollInterval=2000&renewInterval=5000]
```

| Parameter       | Default | Description |
|-----------------|---------|-------------|
| `backend`       | `file`  | Lock strategy backend: `file`, `zookeeper`, or `consul`. |
| `pollInterval`  | `2000`  | How often (ms) a non-leader polls to acquire the lock. |
| `renewInterval` | `5000`  | How often (ms) the current leader renews its lease. |

### Backend Parameters

| Backend      | Parameter         | Default              | Notes |
|--------------|-------------------|----------------------|-------|
| `file`       | `lockDir`         | `os.tmpdir()`        | Advisory file lock via `O_EXCL`. **Not safe on NFS shares** — use `zookeeper` or `consul` in distributed deployments. |
| `zookeeper`  | `hosts`           | `localhost:2181`     | Ephemeral ZooKeeper node; lock auto-released on session expiry. |
|              | `sessionTimeout`  | `30000`              | |
| `consul`     | `host`            | `localhost`          | Session + KV acquire via native `fetch`. |
|              | `port`            | `8500`               | |
|              | `ttl`             | `15s`                | Consul session TTL string (e.g. `15s`, `30s`). |

### Headers Set on Each Exchange

| Header                  | Type      | Description |
|-------------------------|-----------|-------------|
| `CamelMasterIsLeader`   | `boolean` | `true` if this node currently holds the lock. |
| `CamelMasterService`    | `string`  | The service name from the URI. |
| `CamelMasterNodeId`     | `string`  | Unique node identifier for this process. |

## Usage

```js
import { CamelContext } from 'camel-lite-core';
import { MasterComponent } from 'camel-lite-component-master';
import { TimerComponent } from 'camel-lite-component-timer';

const context = new CamelContext();
context.addComponent('master', new MasterComponent());
context.addComponent('timer', new TimerComponent());

context.addRoutes({
  configure(ctx) {
    ctx.from('master:myApp?backend=file&pollInterval=2000')
      .process(exchange => {
        if (exchange.in.getHeader('CamelMasterIsLeader')) {
          console.log('I am the leader — doing leader work');
        }
        // Non-leader nodes reach here with CamelMasterIsLeader = false
        // and an empty body; typically filter them out.
      });
  }
});

await context.start();
```

## See Also

[camel-lite — root README](../../README.md)
