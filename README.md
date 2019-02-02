# Hole [![Build Status](https://travis-ci.org/piglovesyou/node-hole.svg?branch=master)](https://travis-ci.org/piglovesyou/node-hole)
Async friendly, stream-based task consuming utility for Node.js.



# Concept
After years, it has been more important to write less-state code for me and naturally it has become more data-driven/functional style. But that and async programming are not always a good match. On one hand when you process too many async tasks at once, `await Promise.all(promises100000)` for example, you'd end up with error messages such as `process out of memory`, `socket hang up`, `ETIMEDOUT` or `ECONNRESET`. On the other hand, it's not efficient at all when you process whole data one by one in sequence. Reactive Extensions might be a solution though, I didn't want to [tune timer functions](https://github.com/ReactiveX/RxJava/wiki/Backpressure#useful-operators-that-avoid-the-need-for-backpressure) for the problem; all I want is just to set **limit number of parallel execution** and finish a task at the best speed.

Then Node Stream object mode with beautiful backpressuring mechanism appears. Object mode lets you flow JavaScript object in a stream with **`highWaterMark` option**, which decides limit of number of buffering objects. By the native backpressure implementation, a busy writable stream halts data flowing and takes time before requesting another to upstream. And thanks to [`parallel-stream`](https://github.com/mafintosh/parallel-transform), a transform branches out to consume buffer parallely as **it keeps order of data**.

Node Hole offers a fun, easy and efficient way of parallel data consuming by wrapping solid Node Stream implementation with async/promise friendly API.



# Usage
To install `hole` in your project, run:

```bash
$ npm install -S hole
```

... then utilize it like below. Suppose there is a blog post API where `GET /posts/:id` to get post detail JSON and `GET /posts?page=1` for list of post summaries. Let's say we want to **store post details** of the latest 3 pages into local DB.

```javascript
await fromArray([1, 2, 3])                      // Start with pages array
    .pipe(page => getPosts(page))               // (parallel async) Get list of posts for a page
    .split()                                    // Split the array into pieces
    .pipe(post => getPostDetail(post.id), 3)    // (parallel async) Get a detail of post, with maximum parallel request of 3
    .pipe(detail => saveToLocalDB(detail))      // (parallel async) Save the detail to local DB
    .catch(err => console.log(err));            // On any error occurs in the middle, stop the whole process and catch the error in here
console.log('All done :)');
```



# API
* Exported functions
    * [`hole(object)`](#holeobject)
    * [`fromArray(array)`](#fromarrayarray)
    * [`fromStream(readable)`](#fromstreamreadable)
* Chaining functions of `Hole` instance
    * [`.pipe(processor, opts?)`](#pipeprocessor-opts)
    * [`.pipe(transformer, opts?)`](#pipetransformer-opts)
    * [`.split()`](#split)
    * [`.concat(size)`](#concatsize)
    * [`.collect()`](#collect)
* Other types
    * [`Hole`](#hole)
    * [`PipeOption`](#pipeoption)

All methods are typed by [Flow](https://flow.org/en/).



### `hole(object)`

Typed as `hole<T>(object: T): Hole<T>`.

A function to start stream with a single JavaScript object of any kind.

Example:
```javascript
import hole from 'hole';
//...
await hole(998)
    .pipe(n => n + 1)
    .pipe(n => n + 1)
    .pipe(console.log)  // 1000
```



### `fromArray(array)`

Typed as `fromArray<T>(Array<T>): Hole<T>`.

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



### `fromStream(readable)`

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



### `.pipe(processor, opts)`

Typed as `pipe<U>(T => U, PipeOption?): Hole<U>`.

When the `processor` is a synchronous function, it simply gets a value from the previous and passes processed value to the next.

If it returns `null` or `undefined`, that means it **filters out the data** that is not used any more.

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

Note that a processor function will be called with a transform's `this` context: you also can use `.push(data)` as usual in `transform()` function.

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

When the `processor` returns a promise, it's similar but resolved value will be passed to the next.

`pipe<U>(T => Promise<U>, PipeOption): Hole<U>`

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



### `.pipe(transformer, opts)`

Typed as `pipe<U>(stream$Writable, PipeOption): Hole<U>`.

Also `.pipe()` accepts Node native Transformer where you can utilize [`csv2`](https://www.npmjs.com/package/csv2) etc.

[Example](#fromstreamreadable)



### `.split()`

Typed as `split(): Hole<$ElementType<T, number>>`.

*Previous value should be array.* It splits the array so the next process can handle each piece of it.

[Example](#usage)



### `.concat(size)`

Typed as `concat(number): Hole<Array<T>>`.

It concatenates sequential data to be specified size of array. This is useful when you post array data at once in the way that [Elasticsearch Bulk API does](https://www.elastic.co/guide/en/elasticsearch/reference/6.2/docs-bulk.html).

Example:
```javascript
await fromArray([1, 2, 3, 4, 5])
    .concat(2)
    .pipe(console.log); // [ 1, 2 ]
                        // [ 3, 4 ]
                        // [ 5 ]
```



### `.collect()`

`collect(): Promise<Array<T>>`

It collects all data that the previous process returns and gives you an array. Note that, when number of data is enormous, the collected array may oppresse room of your memory.

Example:
```javascript
const results = await fromArray([1, 2, 3, 4, 5])
    .pipe(n => n * 10)
    .collect();
console.log(results); // [10, 20, 30, 40, 50]
```



### `Hole`

The core class that this package exports.

Hole extends [`LazyPromise`](https://github.com/then/lazy-promise) that starts streaming when `.then()` or `.catch()` is called. Other extended functions are listed below.


### `PipeOption`

```javascript
type PipeOption =
  | {
      maxParallel: number,
      highWaterMark: number,
    }
  | number;
```

If it's a number, it is treated as a `maxParallel` value.

| Option property       | Default value |  Valid when first argument of `.pipe()` is | Meaning   |
| --------------------- | ------------- | --------- | ----------- |
| maxParallel           | 5             | Async function | Maximum number of parallel execution of process |
| highWaterMark         | 16            | Transformer, Sync and async function | Maximum number of buffer that will be consumed by processor. [Read more](https://nodejs.org/api/stream.html#stream_writable_writablehighwatermark)      |



# License

MIT
