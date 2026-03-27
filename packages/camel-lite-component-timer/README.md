[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

Periodic exchange trigger with no external dependencies. Fires on a fixed interval, optionally with a startup delay and a maximum fire count.

## Install

```sh
npm install camel-lite-component-timer
```

## URI Syntax

```
timer:name[?period=1000&delay=0&repeatCount=0]
```

| Parameter     | Default | Description |
|---------------|---------|-------------|
| `period`      | `1000`  | Interval between firings in milliseconds. |
| `delay`       | `0`     | Delay before the first firing in milliseconds. |
| `repeatCount` | `0`     | Number of times to fire. `0` = infinite. |

### Headers Set on Each Exchange

| Header                | Type     | Description |
|-----------------------|----------|-------------|
| `CamelTimerName`      | `string` | The timer name from the URI. |
| `CamelTimerFiredTime` | `Date`   | Timestamp of the firing. |
| `CamelTimerCounter`   | `number` | Fire count (1-based). |

## Usage

```js
import { CamelContext } from 'camel-lite-core';
import { TimerComponent } from 'camel-lite-component-timer';

const context = new CamelContext();
context.addComponent('timer', new TimerComponent());

context.addRoutes({
  configure(ctx) {
    ctx.from('timer:tick?period=5000&repeatCount=3')
      .process(exchange => {
        const counter = exchange.in.getHeader('CamelTimerCounter');
        const firedAt = exchange.in.getHeader('CamelTimerFiredTime');
        console.log(`Tick #${counter} at ${firedAt.toISOString()}`);
      });
  }
});

await context.start();
// Fires 3 times at 5-second intervals, then stops.
```

## See Also

[camel-lite — root README](../../README.md)
