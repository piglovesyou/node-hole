const isPromise = require('is-promise');
const pump = require('pump');
const split2 = require('split2');
const fs = require('fs');
const fetch = require('node-fetch');
const streamify = require('stream-array');
const isStream = require('is-stream');

const parallelTransform = require('parallel-transform');

const {Readable, Writable, Transform, PassThrough, Stream} = require('stream');

const defaultWritableHighWaterMark = getDefaultWritableHighWaterMark();

main()
    .catch(reason => {
      console.log(reason);
      throw reason;
    });

async function main() {
  const url = 'https://jsonplaceholder.typicode.com/posts';
  console.time('speed?')
  await streamFromArray([url])
      .pipe(async function (url) {
        return await fetch(url)
            .then(res => res.text())
            .then(JSON.parse);
      })
      .split()
      .pipe(async function (post) {
        const url = `https://jsonplaceholder.typicode.com/posts/${post.id}`;
        return await fetch(url)
            .then(res => res.text())
            .then(JSON.parse);
      })
      .pipe(async function (post) {
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
      .pipe((out) => {
        // console.log(out);
      })
      .exec();
  console.timeEnd('speed?')
  console.log('done.');
}

function stream(readable) {
  const gates = [readable];
  return createInstance(gates);
}

function streamFromArray(array) {
  return stream(streamify(array));
}

function pipe(rest, newFn) {
  return createInstance([...rest, newFn]);
}

function createInstance(gates) {
  return {
    pipe: pipe.bind(null, gates),
    exec: exec.bind(null, gates),
    split: split.bind(null, gates),
  };
}

function split(gates) {
  const r = new Transform({objectMode: true,});
  r._transform = function (chunks, enc, callback) {
    if (!Array.isArray(chunks)) {
      throw new Error('.split(fn) must receive an array.');
    }
    push.call(this, chunks, 0);
    callback();

    function push(chunks, curr) {
      if (!chunks[curr]) return;
      this.push(chunks[curr]);
      push.call(this, chunks, curr + 1);
    }
  };
  return createInstance([...gates, r]);
}

function exec([readable, ...rest]) {
  return new Promise((resolve, reject) => {
    const streams = [
      readable,
      ...(rest.map((fn, i, rest) => {
        if (isStream(fn)) return fn;

        return parallelTransform(defaultWritableHighWaterMark, function (obj, callback) {
          const rv = fn.call(this, obj);
          if (isPromise(rv)) {
            rv.then(resolved => {
              callback(null, resolved);
            });
            return;
          }
          callback(null, rv);
        });
      })),
      (error) => {
        if (error) reject(error); else resolve();
      }
    ];
    pump.apply(null, streams);
  });
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDefaultWritableHighWaterMark() {
  const w = new Writable({objectMode: true});
  const rv = w.writableHighWaterMark;
  w.destroy();
  return rv;
}
