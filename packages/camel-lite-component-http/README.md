[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

HTTP producer for outbound fetch requests. Sends the exchange body as the request body and sets the response body on the exchange. Producer-only — there is no embedded server/consumer. For inbound HTTP, use [Hono](https://hono.dev/) or Express and bridge via `direct:`.

## Install

```sh
npm install camel-lite-component-http
```

## URI Syntax

```
http://host/path[?method=GET&contentType=application/json&headers.X-Custom=value]
```

| Parameter      | Default              | Description |
|----------------|----------------------|-------------|
| `method`       | `GET`                | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`. |
| `contentType`  | `application/json`   | Value for the `Content-Type` request header. |
| `headers.*`    | *(none)*             | Additional request headers. e.g. `headers.Authorization=Bearer+token`. |

## Usage

```js
import { CamelContext } from 'camel-lite-core';
import { HttpComponent } from 'camel-lite-component-http';

const context = new CamelContext();
context.addComponent('http', new HttpComponent());

context.addRoutes({
  configure(ctx) {
    ctx.from('direct:callApi')
      .to('http://api.example.com/users?method=POST&contentType=application/json');
  }
});

await context.start();

const template = context.createProducerTemplate();
const exchange = await template.send('direct:callApi', ex => {
  ex.in.body = JSON.stringify({ name: 'Alice' });
});
console.log('Response:', exchange.in.body);

await context.stop();
```

## See Also

[camel-lite — root README](../../README.md)
