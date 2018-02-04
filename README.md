# Hole [![Build Status](https://travis-ci.org/piglovesyou/node-hole.svg?branch=master)](https://travis-ci.org/piglovesyou/node-hole)
Async friendly, stream-based task consuming utility in Node.js

# Concept
After years, it gets more important for me to write less-state code and naturally it has become more data-driven/functional style. But that style and async programming, inevitable in Node, are not always a good match: on one hand, when you process and buffer too many async tasks, you'd end up with `FATAL ERROR: CALL_AND_RETRY_2 Allocation failed - process out of memory` or `Error: socket hang up` message. On the other hand, it's not efficient at all when you process data one by one in sequence. Reactive Extensions might be a close solution though, I didn't want to [tune timer functions](https://github.com/ReactiveX/RxJava/wiki/Backpressure#useful-operators-that-avoid-the-need-for-backpressure) for that problem; all I want is just to set **limit of buffer** and **finish a task in the best speed**. 

Then Node Stream object mode with beautiful backpressuring mechanism comes along. Object mode lets you flow any JavaScript object in a stream with **`highWaterMark` option**, which decides limit of number of buffering objects. By the native backpressure implementation, a busy write stream reaching to the water mark requests upper readable stream to moderate amount of the data stream. And thanks for [`parallel-stream`](https://github.com/mafintosh/parallel-transform), each part of a stream tries to fill full of buffers all the time as **it keeps order of data** at the same time.

Node Hole offers a fun, easy and efficient way of parallel data consuming by wrapping solid Node Stream implementation with async/promise friendly API.

# Usage
To install `hole` in your project, run:

```bash
$ npm add piglovesyou/node-hole
```

Then utilize it like below:

```javascript
import hole from 'hole';
import fetch from 'node-fetch';

main();

async function main() {
    const url = 'https://jsonplaceholder.typicode.com/posts';

    await hole({url})   // `hole(object: any): Hole`
        .pipe(async function ({url}) {  // Async function! And it never blocks the stream,
                                        // thanks for parallel-stream module
            const posts = await fetch(url)
                .then(res => res.text())
                .then(JSON.parse);
            return posts; // Array.
        })
        .pieces()    // Split an array into pieces,
        .pipe(async function (post) {   // ...then the next step can handle the piece one by one
            const url = `https://jsonplaceholder.typicode.com/posts/${post.id}/comments`;
            const comments = await fetch(url)
                .then(res => res.text())
                .then(JSON.parse);
            return {
                id: post.id,
                title: post.title,
                comments: comments.map(c => c.body),
            };
        })
        .pipe((post) => {
          assert(typeof post.id === 'number');
          assert(typeof post.title === 'string');
          assert(Array.isArray(post.comments));
        })
        .start();   // Don't forget to call ".start()" that starts streaming.
                    // It returns a promise object so that you can control additional async flow 

    console.log('done.');
}
```

# API

## Exported functions

### `hole(object: any): Hole`
### `holeWithArray(array: Array<any>): Hole`
// TODO

### `holeWithStream(readable: ReadableStream): Hole`

Example:
```javascript
import fs from 'fs';
import csv2 from 'csv2';
import hole from 'hole';

const nameColumnIndex = 3;
hole(fs.createReadableStream('./data.csv'))
    .pipe(csv2())
    .pipe(record => record[nameColumnIndex])
    .pipe(console.log)  // James
                        // John
                        // Robert
                        // Michael
                        // ...
    .start();
```

## Functions of `Hole`

### `type Gate`
`Gate` is a type that you can pass to `.pipe(gate)`. It can be a `function`, `async function` or native writable stream.
```javascript
type Gate = ((data: any) => (any | Promise<any>))
    | stream$Writable
    | stream$Transform;
```

### `.pipe(fn: Gate): Hole`
### `.pieces(): Hole`
### `.start(): Promise<void>`
// TODO

# License

MIT
