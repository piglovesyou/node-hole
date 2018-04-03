# Hole [![Build Status](https://travis-ci.org/piglovesyou/node-hole.svg?branch=master)](https://travis-ci.org/piglovesyou/node-hole)
Async friendly, stream-based task consuming utility for large amounts of data in Node.js.

# Concept
After years, it has been more important to write less-state code for me and naturally it has become more data-driven/functional style. But that and async programming are not always a good match. On one hand when you process too many async tasks at once, `await Promise.all(promises100000)` for example, you'd end up with error messages such as `process out of memory`, `socket hang up`, `ETIMEDOUT` or `ECONNRESET`. On the other hand, it's not efficient at all when you process whole data one by one in sequence. Reactive Extensions might be a solution though, I didn't want to [tune timer functions](https://github.com/ReactiveX/RxJava/wiki/Backpressure#useful-operators-that-avoid-the-need-for-backpressure) for the problem; all I want is just to set **limit number of parallel execution** and finish a task at the best speed.

Then Node Stream object mode with beautiful backpressuring mechanism appears. Object mode lets you flow JavaScript object in a stream with **`highWaterMark` option**, which decides limit of number of buffering objects. By the native backpressure implementation, a busy writable stream halts data flowing and takes time before requesting another to upstream. And thanks to [`parallel-stream`](https://github.com/mafintosh/parallel-transform), a transform branches out to consume buffer parallely as **it keeps order of data**.

Node Hole offers a fun, easy and efficient way of parallel data consuming by wrapping solid Node Stream implementation with async/promise friendly API.

# Usage
To install `hole` in your project, run:

```bash
$ npm install hole
```

then utilize it like below:

```javascript
// Let's say we want to save all post details into a local search index.

await hole(await getPageSize())                 // Start with fetching page size of whole posts
    .pipe(pageSize => _.range(1, pageSize + 1)) // Create pages array like [1, 2, 3, 4, ...]
    .split()                                    // For every page
    .pipe(page => getPosts(page))               // (async) Get a post list
    .split()                                    // For every post
    .pipe(post => getPostDetail(post.id), 2)    // (async) Get a detail of post, with maximum parallel request of 2
    .pipe(detail => saveToSearchIndex(detail))  // (async) And save the detail
    .catch(err => console.log(err));            // On any error in the middle, it stops stream
                                                // with an error that is able to catch
console.log('done.');
```

# API 
* Exported functions
    * [`hole(object: any): Hole`](#holeobject-any-hole)
    * [`fromArray(array: Array<any>): Hole`](#fromarrayarray-arrayany-hole)
    * [`fromStream(readable: ReadableStream): Hole`](#fromstreamreadable-readablestream-hole)
* Chaining functions of `Hole`
    * [`.pipe(processor: (any) => any, opts?: {highWaterMark?: number}): Hole`](#pipeprocessor-any--any-opts-highwatermark-number-hole)
    * [`.pipe(processor: (any) => Promise<any>, opts?: {maxParallel?: number, highWaterMark?: number} | number): Hole`](#pipeprocessor-any--promiseany-opts-maxparallel-number-highwatermark-number--number-hole)
    * [`.pipe(processor: Transform, opts?: {highWaterMark?: number}): Hole`](#pipeprocessor-transform-opts-highwatermark-number-hole)
    * [`.split(): Hole`](#split-hole)
    * [`.concat(size: number): Hole`](#concatsize-number-hole)
    * [`.collect(): Promise<Array<any>>`](#collect-promisearrayany)

### `hole(object: any): Hole`
A function to start stream with any kind of a single JavaScript object.

Example:
```javascript
import hole from 'hole';
//...
await hole(998)
    .pipe(n => n + 1)
    .pipe(n => n + 1)
    .pipe(console.log)  // 1000
```

### `fromArray(array: Array<any>): Hole`
A function to start stream with fixed multiple objects with an array.

Example:
```javascript
import {fromArray} from 'hole';
...
await fromArray([1, 2, 3, 4, 5])
    .pipe(n => n * 10)
    .pipe(console.log); // 10
                        // 20
                        // 30
                        // 40
                        // 50
```

### `fromStream(readable: ReadableStream): Hole`
A function to start stream with an native Node readable stream.

Example:
```javascript
import {fromStream} from 'hole';
import fs from 'fs';
import csv2 from 'csv2';
...
  const nameColumnIndex = 3;
  await fromStream(fs.createReadableStream('./data.csv'))
      .pipe(csv2())
      .pipe(record => record[nameColumnIndex])
      .pipe(console.log); // James
                          // John
                          // Robert
                          // Michael
                          // ...
```

Hole extends [`LazyPromise`](https://github.com/then/lazy-promise) that starts streaming when `.then()` or `.catch()` is called. Other extended functions are listed below.

### `.pipe(processor: (any) => any, opts?: {highWaterMark?: number}): Hole`
The function "processor" gets data passed by the previous processor. The returned value is passed to the next.

If it returns `null` or `undefined`, that means it **filters out the data** that will not be used any more.

Example:
```javascript
await fromArray([1, 2, 3, 4, 5])
  .pipe(n => {
    if (n > 2) return n;
  })
  .pipe(console.log); // 3
                      // 4
                      // 5
```

Note that a processor function will be called with a transform's `this` context: you can use `.push(data)` as usual in `transform()` function.

Example:

```javascript
await hole(5)
    .pipe(function decrementAndPush(n) {
      if (n <= 0) return;
      this.push(n);
      decrementAndPush.call(this, n - 1);
    })
    .pipe(console.log); // 5
                        // 4
                        // 3
                        // 2
                        // 1
```

### `.pipe(processor: (any) => Promise<any>, opts?: {maxParallel?: number, highWaterMark?: number} | number): Hole`
When a processor returns a promise object, its **resolved value** will be passed to the next processor.

Also, it accepts an option. If it's an object, 2 properties are acceptable. If it's a number, it'll be passed as `maxParallel`.

| Option property       | Default value | Meaning  |
| ------------- | ------------- | ----- |
| maxParallel      | 5 | Maximum number of parallel execution of process |
| highWaterMark    | 16 | Maximum number of buffer that will be consumed by processor. [Read more](https://nodejs.org/api/stream.html#stream_writable_writablehighwatermark)      |

Example:
```javascript
await fromArray([1, 2, 3, 4])
  .pipe(async page => {
    const posts = await getPosts(page);
    return posts.filter(post => post.author !== 'anonimous');
  }, 2) // Limit maxParallel to 2
  .split()
  .pipe(post => console.log(post.title))  // Lorem ipsum ...
                                          // Ut enim ad...
                                          // Duis aute irure...
                                          // Excepteur sint...
```

### `.pipe(processor: Transform, opts?: {highWaterMark?: number}): Hole`
Also `.pipe()` accepts Node native Transformer object where you can utilize such as `csv2` and ``.

[Example:](#fromstreamreadable-readablestream-hole)

### `.split(): Hole`
It splits an array that a previous process returns so the next process can handle each element of the array.

[Example:](#usage)

### `.concat(size: number): Hole`
It concatenates sequential data to be size of array. It is useful to post multiple data at once in the way that [Elasticsearch Bulk API](https://www.elastic.co/guide/en/elasticsearch/reference/6.2/docs-bulk.html) does.

Example:
```javascript
await fromArray([1, 2, 3, 4, 5])
    .concat(2)
    .pipe(console.log); // [ 1, 2 ]
                        // [ 3, 4 ]
                        // [ 5 ]
```

### `.collect(): Promise<Array<any>>`

It collects all data that the previous process returns and gives you an array. Note that, when number of data gets a lot, it might oppresse room of memory.

Example:
```javascript
const results = await fromArray([1, 2, 3, 4, 5])
    .pipe(n => n * 10)
    .collect();
console.log(results); // [10, 20, 30, 40, 50]
```

# License

MIT
