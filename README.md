# Hole [![Build Status](https://travis-ci.org/piglovesyou/node-hole.svg?branch=master)](https://travis-ci.org/piglovesyou/node-hole)
Async friendly, stream-based task consuming utility in Node.js

# Concept
After years, it has been more important to write less-state code for me and naturally it has become more data-driven/functional style. But that style and async programming, inevitable in Node, are not always a good match: on one hand when you process too many async tasks at one time, you'd end up with `FATAL ERROR: CALL_AND_RETRY_2 Allocation failed - process out of memory` or `Error: socket hang up` message. On the other hand, it's not efficient at all when you process data one by one in sequence. Reactive Extensions might be a solution though, I didn't want to [tune timer functions](https://github.com/ReactiveX/RxJava/wiki/Backpressure#useful-operators-that-avoid-the-need-for-backpressure) for that problem; all I want is just to set **limit of buffer** and **finish a task in the best speed**. 

Then Node Stream object mode with beautiful backpressuring mechanism comes along. Object mode lets you flow JavaScript object in a stream with **`highWaterMark` option**, which decides limit of number of buffering objects. By the native backpressure implementation, a busy writable stream reaching to its water mark requests upper readable stream to moderate amount of the flow. And thanks for [`parallel-stream`](https://github.com/mafintosh/parallel-transform), each part of a stream tries to fill full of buffers all the time as **it keeps order of data** at the same time.

Node Hole offers a fun, easy and efficient way of parallel data consuming by wrapping solid Node Stream implementation with async/promise friendly API.

# Usage
To install `hole` in your project, run:

```bash
$ npm install hole
```

Then utilize it like below:

```javascript
import hole from 'hole';
import fetch from 'node-fetch';

main();

async function main() {
    await hole('https://jsonplaceholder.typicode.com/posts')   // `hole(object: any): Hole`
        .pipe(async function (url) {  // Async function! And it never blocks the stream,
                                      // thanks for parallel-stream module
            const posts = await fetch(url)
                .then(res => res.text())
                .then(JSON.parse);
            return posts; // An array.
        })
        .pieces()    // Split the array into pieces,
        .pipe(async function (post) {   // ...then the next step can handle the piece one by one
            const comments = await fetch(`https://jsonplaceholder.typicode.com/posts/${post.id}/comments`)
                .then(res => res.text())
                .then(JSON.parse);
            return {
                id: post.id,
                title: post.title,
                comments: comments.map(c => c.body),
            };
        }, 4)  // You can adjust limit of simultanious running tasks,
               // which is 16 by default
        .pipe((post) => {
          assert(typeof post.id === 'number');
          assert(typeof post.title === 'string');
          assert(Array.isArray(post.comments));
        })
        .catch((err) => console.log(err))   // Because Hole extends Promise, it emits rejection and halts
                                            // during a stream, which you can catch as usual
    console.log('done.');
}
```

# API

## Exported functions

#### `hole(object: any): Hole`
#### `holeWithArray(array: Array<any>): Hole`
#### `holeWithStream(readable: ReadableStream): Hole`

Example:
```javascript
import fs from 'fs';
import csv2 from 'csv2';
import hole from 'hole';

const nameColumnIndex = 3;
holeWithStream(fs.createReadableStream('./data.csv'))
    .pipe(csv2())
    .pipe(record => record[nameColumnIndex])
    .pipe(console.log); // James
                        // John
                        // Robert
                        // Michael
                        // ...
```

## Chaining functions of `Hole`

#### `.pipe(fn: Gate, opts: GateOption): Hole`
#### `.filter(fn: Gate, opts: GateOption): Hole`
#### `.pieces(): Hole`

## Data types

#### `type Gate`
`Gate` is a type that you can pass to `.pipe(gate)`. It can be a `function`, `async function` or native writable stream.

#### `type GateOption`
`GateOption` is a type to pass to transform stream. If it's number, it's used as highWaterMark, which is 16 by default of Node Stream. Otherwise it'll be passed as a Node transform option.

# License

MIT
