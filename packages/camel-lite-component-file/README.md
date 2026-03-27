[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What

File read (consumer: polls a directory) and write (producer: writes exchange body to a file). Supports configurable file name, character encoding, and auto-delete after read.

## Install

```sh
npm install camel-lite-component-file
```

## URI Syntax

```
file:/absolute/path[?fileName=out.txt&charset=utf8&delete=false]
```

| Parameter  | Default     | Description |
|------------|-------------|-------------|
| `fileName` | *(auto)*    | Output file name for producers. Consumers ignore this; all files in the directory are read. |
| `charset`  | `utf8`      | Character encoding for reading/writing file content. |
| `delete`   | `false`     | Consumer only: delete the source file after it has been successfully read. |

## Usage

**Producer — write exchange body to a file:**

```js
import { CamelContext } from 'camel-lite-core';
import { FileComponent } from 'camel-lite-component-file';

const context = new CamelContext();
context.addComponent('file', new FileComponent());

context.addRoutes({
  configure(ctx) {
    ctx.from('direct:writeFile')
      .to('file:/tmp/output?fileName=result.txt&charset=utf8');
  }
});

await context.start();

const template = context.createProducerTemplate();
await template.sendBody('direct:writeFile', 'Hello, file!');

await context.stop();
```

**Consumer — read files from a directory:**

```js
context.addRoutes({
  configure(ctx) {
    ctx.from('file:/tmp/inbox?delete=true')
      .process(exchange => {
        console.log('File content:', exchange.in.body);
        console.log('File name:', exchange.in.getHeader('CamelFileName'));
      });
  }
});
```

## See Also

[camel-lite — root README](../../README.md)
