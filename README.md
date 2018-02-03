# Hole [![Build Status](https://travis-ci.org/piglovesyou/node-hole.svg?branch=master)](https://travis-ci.org/piglovesyou/node-hole)
Async friendly parallel-stream utility in Node.js

# Usage
To install `hole` in your project, run:

```bash
$ npm add piglovesyou/node-hole
```

Then use it like below.

```javascript
import {from as holeFrom} from 'hole';
import fetch from 'node-fetch';

main();

async function main() {
    const url = 'https://jsonplaceholder.typicode.com/posts';

    await holeFrom({url})   // `holeFrom(object: any): HoleStream`
        .pipe(async function ({url}) {  // Async function! And it never blocks the stream,
                                        // thanks for parallel-stream module
            const posts = await fetch(url)
                .then(res => res.text())
                .then(JSON.parse);
            return posts; // Array.
        })
        .split()    // Split an array into pieces,
        .pipe(async function (post) {   // ...then the next step can deal with a piece of the array
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
                    // And returns a promise object so that you can control additional async flow 
    console.log('done.');
}
```

# API

## Exported functions

### `hole(readable: ReadableStream): HoleStream`

Example:
```javascript
import {Readable} from 'stream'
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

### `holeFrom(object: any): HoleStream`
// TODO

### `holeFromArray(array: Array\<any>): HoleStream`
// TODO

## Functions of HoleStream instance

### `.pipe(fn: (data: any) => (any|Promise<any>)): HoleStream`
### `.pieces(): HoleStream`
### `.start(): Promise<void>`
// TODO

# Concept
// TODO

# License

MIT
