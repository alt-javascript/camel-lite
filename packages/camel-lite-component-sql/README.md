[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

SQL query and update producer using Node.js built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html) — no native compilation required. The SQL statement is placed in the URI path (URL-encoded). Query results are set as the exchange body; for updates the row-change count is set.

> **Requires Node.js 22.5.0 or later.** Uses `node:sqlite` (DatabaseSync / StatementSync). No `better-sqlite3` or other native dependency.

## Install

```sh
npm install camel-lite-component-sql
```

## URI Syntax

```
sql:<URL-encoded SQL>[?url=jdbc:sqlite::memory:]
```

URL-encode spaces as `+` in the SQL statement.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `url`     | *(required)* | SQLite connection URL. Format: `jdbc:sqlite:<file-path>` or `jdbc:sqlite::memory:` for in-memory. |

## Usage

```js
import { CamelContext } from 'camel-lite-core';
import { SqlComponent } from 'camel-lite-component-sql';

const context = new CamelContext();
context.addComponent('sql', new SqlComponent());

context.addRoutes({
  configure(ctx) {
    // Insert: exchange body provides the bound parameter value
    ctx.from('direct:logEvent')
      .to('sql:INSERT+INTO+events+(message)+VALUES+(?)?url=jdbc:sqlite:/tmp/events.db');

    // Query: results returned as array of row objects
    ctx.from('direct:fetchEvents')
      .to('sql:SELECT+*+FROM+events?url=jdbc:sqlite:/tmp/events.db');
  }
});

await context.start();

const template = context.createProducerTemplate();

// Insert
await template.sendBody('direct:logEvent', 'something happened');

// Query
const exchange = await template.send('direct:fetchEvents', ex => { ex.in.body = []; });
console.log('Rows:', exchange.in.body);

await context.stop();
```

## See Also

[camel-lite — root README](../../README.md)
