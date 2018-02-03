import isPromise from 'is-promise';
import pump from 'pump';
import streamify from 'stream-array';
import isStream from 'is-stream';
import parallelTransform from 'parallel-transform';
import {Transform, Writable} from 'stream';

const defaultWritableHighWaterMark = getDefaultWritableHighWaterMark();

export default hole;
export {holeFromArray as fromArray}
export {holeFromObject as from}

function hole(readable) {
  const gates = [readable];
  return createInstance(gates);
}

function holeFromArray(array) {
  return hole(streamify(array));
}

function holeFromObject(obj) {
  return holeFromArray([obj]);
}

function pipe(rest, newFn) {
  return createInstance([...rest, newFn]);
}

function createInstance(gates) {
  return {
    pipe: pipe.bind(null, gates),
    split: split.bind(null, gates),
    start: exec.bind(null, gates),
    // TODO: filter()
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
      ...(rest.map((fn) => {
	if (isStream(fn)) return fn;

	// TODO: Make able to pass parallel limit by api
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

// function timeout(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

function getDefaultWritableHighWaterMark() {
  const w = new Writable({objectMode: true});
  const rv = w.writableHighWaterMark;
  w.destroy();
  return rv;
}
