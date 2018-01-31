const isPromise = require('is-promise');
const pump = require('pump');
const split = require('split');
const fs = require('fs');

const {Readable, Writable, Transform, Stream} = require('stream');

main()
    .catch(reason => {
      console.log(reason);
      throw reason;
    });

async function main() {
  const r = fs.createReadStream('./package.json');

  stream(r)
      .pipe(split())
      .pipe(function (chunk) {
        console.log(`+++${chunk} (${this.readableLength||'_'}:${this.writableLength||'_'})`);
        return chunk;
      })
      .pipe(async (chunk) => {
        console.log(`===${chunk} (${this.readableLength||'_'}:${this.writableLength||'_'})`);
        await timeout(1000);
        return chunk;
      })
      .exec();

  await timeout(1000); // for dev
}

function stream(readable) {
  // TODO: assert if the readable is object mode
  const tanks = [readable];
  return {
    pipe: pipe.bind(null, tanks),
    exec: exec.bind(null, tanks),
  };
}

function streamFromArray(array) {
  const r = new Readable({objectMode: true,});
  array.forEach(e => r.push(e));
  return stream(r);
}

function pipe(rest, newFn) {
  const tanks = [
    ...rest,
    newFn
  ];
  return {
    pipe: pipe.bind(null, tanks),
    exec: exec.bind(null, tanks),
  };
}

function exec([readable, ...rest], onError) {
  // Return promise
  const streams = [
    readable,
    ...(rest.map((fn, i, rest) => {
      if (fn instanceof Stream) return fn;
      if (rest.length -1 === i ) {
        const s = new Writable({objectMode: true,});
        s._write = _processStream;
        return s;
      }
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
    onError || noop,
  ];
  pump.apply(null, streams);
}

function noop() {}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
