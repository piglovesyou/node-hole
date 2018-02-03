const isPromise = require('is-promise');
const pump = require('pump');
const split2 = require('split2');
const fs = require('fs');
const fetch = require('node-fetch');
const streamify = require('stream-array');
const isStream = require('is-stream');

const transform = require('parallel-transform');

// const stream = transform(10, function (data, callback) { // 10 is the parallism level
//   setTimeout(function () {
//     callback(null, data);
//   }, Math.random() * 1000);
// });

const {Readable, Writable, Transform, PassThrough, Stream} = require('stream');

main()
    .catch(reason => {
      console.log(reason);
      throw reason;
    });

async function main() {
  const url = 'https://jsonplaceholder.typicode.com/posts';
  await streamFromArray([url])
      .pipe(async function (url) {
        const posts = await fetch(url)
            .then(res => res.text())
            .then(JSON.parse);
        return posts;
      })
      .split()
      .pipe(async function (post) {
        const url = `https://jsonplaceholder.typicode.com/posts/${post.id}/comments`;
        const comments = await fetch(url)
            .then(res => res.text())
            .then(JSON.parse);
        return {
          postId: post.id,
          postTitle: post.title,
          commentTitles: comments.map(c => c.body),
        };
      })
      .pipe((out) => {
        console.log(out);
      })
      .exec();
  // const r = fs.createReadStream('./package.json');
  // await stream(r)
  //     .pipe(split2())
  //     .pipe(function (chunk) {
  //       // console.log(`+++${chunk} (${this.readableLength == null ? '_' :
  // this.readableLength}:${this.writableLength == null ? '_' : this.writableLength})`); return chunk; }) .pipe(async
  // function (chunk) { await timeout(10); console.log(`???${chunk} (${this.readableLength == null ? '_' :
  // this.readableLength}:${this.writableLength == null ? '_' : this.writableLength})`); return chunk; }) .pipe(async
  // function (chunk) { await timeout(100); console.log(`===${chunk} (${this.readableLength == null ? '_' :
  // this.readableLength}:${this.writableLength == null ? '_' : this.writableLength})`); return chunk; }) .exec();
  console.log('done.');
}

function stream(readable) {
  // TODO: assert if the readable is object mode
  const tanks = [readable];
  return createInstance(tanks);
}

function streamFromArray(array) {
  return stream(streamify(array));
}

function pipe(rest, newFn) {
  return createInstance([...rest, newFn]);
}

function createInstance(tanks) {
  return {
    pipe: pipe.bind(null, tanks),
    exec: exec.bind(null, tanks),
    split: split.bind(null, tanks),
  };
}

function split(tanks) {
  const r = new Transform({objectMode: true,});
  r._transform = function (chunks, enc, callback) {
    if (!Array.isArray(chunks)) {
      throw new Error('.split(fn) must receive array.');
    }
    push.call(this, chunks, 0);
    callback();

    function push(chunks, curr) {
      if (!chunks[curr]) return;
      this.push(chunks[curr]);
      push.call(this, chunks, curr + 1);
    }
  };
  return createInstance([...tanks, r]);
}

function exec([readable, ...rest]) {
  return new Promise((resolve, reject) => {
    const streams = [
      readable,
      ...(rest.map((fn, i, rest) => {
        if (isStream(fn)) return fn;

        // if (rest.length - 1 === i) {
        //   const s = new Writable({objectMode: true,});
        //   s._write = _processStream;
        //   return s;
        // }

        const s = new Transform({objectMode: true,});
        s._transform = _processStream;
        return s;

        function _processStream(obj, enc, callback) {
          const rv = fn.call(this, obj);
          if (isPromise(rv)) {
            rv.then(resolvedValue => {
              callback(null, resolvedValue);
            });
            return;
          }
          callback(null, rv);
        }
      })),
      (error) => {
        if (error) reject(error); else resolve();
      }
    ];
    pump.apply(null, streams);
  });
}

// function noop() {}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
