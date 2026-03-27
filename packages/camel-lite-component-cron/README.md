[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

Cron-scheduled exchange trigger via [`node-cron`](https://www.npmjs.com/package/node-cron). Fires at the times defined by a standard 5- or 6-field cron expression. The schedule is validated at endpoint construction — an invalid expression throws a `CamelError` before the context starts.

## Install

```sh
npm install camel-lite-component-cron
```

## URI Syntax

```
cron:name?schedule=<cron-expression>[&timezone=UTC]
```

URL-encode spaces in the cron expression as `+`.

| Parameter  | Default | Description |
|------------|---------|-------------|
| `schedule` | *(required)* | 5-field (`* * * * *`) or 6-field (`* * * * * *`) cron expression with spaces encoded as `+`. Validated by `node-cron` at construction. |
| `timezone` | `UTC`   | IANA timezone name (e.g. `America/New_York`). |

### Headers Set on Each Exchange

| Header               | Type     | Description |
|----------------------|----------|-------------|
| `CamelCronName`      | `string` | The cron name from the URI. |
| `CamelCronFiredTime` | `Date`   | Timestamp of the scheduled firing. |

## Usage

```js
import { CamelContext } from 'camel-lite-core';
import { CronComponent } from 'camel-lite-component-cron';
import { DirectComponent } from 'camel-lite-component-direct';

const context = new CamelContext();
context.addComponent('cron', new CronComponent());
context.addComponent('direct', new DirectComponent());

context.addRoutes({
  configure(ctx) {
    // Fires at midnight UTC every day
    ctx.from('cron:midnight?schedule=0+0+0+*+*+*')
      .to('direct:dailyJob');

    ctx.from('direct:dailyJob')
      .process(exchange => {
        console.log('Daily job triggered at', exchange.in.getHeader('CamelCronFiredTime'));
      });
  }
});

await context.start();
```

## See Also

[camel-lite — root README](../../README.md)
