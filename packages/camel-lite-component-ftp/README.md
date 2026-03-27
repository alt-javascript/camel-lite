[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

FTP producer and consumer via [`basic-ftp`](https://www.npmjs.com/package/basic-ftp). Producers upload the exchange body to the configured directory; consumers poll a directory and emit one exchange per file found.

## Install

```sh
npm install camel-lite-component-ftp
```

## URI Syntax

```
ftp://host/directory[?username=u&password=p&port=21&passive=true]
```

| Parameter  | Default | Description |
|------------|---------|-------------|
| `username` | *(required)* | FTP account username. |
| `password` | *(required)* | FTP account password. |
| `port`     | `21`    | FTP server port. |
| `passive`  | `true`  | Use passive mode transfers. Set to `false` for active mode. |

## Usage

**Producer — upload exchange body to FTP directory:**

```js
import { CamelContext } from 'camel-lite-core';
import { FtpComponent } from 'camel-lite-component-ftp';

const context = new CamelContext();
context.addComponent('ftp', new FtpComponent());

context.addRoutes({
  configure(ctx) {
    ctx.from('direct:upload')
      .to('ftp://ftp.example.com/uploads?username=user&password=secret');
  }
});

await context.start();

const template = context.createProducerTemplate();
await template.send('direct:upload', ex => {
  ex.in.body = 'file content here';
  ex.in.setHeader('CamelFileName', 'report.txt');
});

await context.stop();
```

**Consumer — poll an FTP directory:**

```js
context.addRoutes({
  configure(ctx) {
    ctx.from('ftp://ftp.example.com/inbox?username=user&password=secret')
      .process(exchange => {
        console.log('Downloaded:', exchange.in.getHeader('CamelFileName'));
        console.log('Content:', exchange.in.body);
      });
  }
});
```

## See Also

[camel-lite — root README](../../README.md)
