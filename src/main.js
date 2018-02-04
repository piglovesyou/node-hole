// @flow

import isPromise from 'is-promise';
import pump from 'pump';
import streamify from 'stream-array';
import isStream from 'is-stream';
import parallelTransform from 'parallel-transform';
import {Transform, Writable} from 'stream';

const defaultWritableHighWaterMark = getDefaultWritableHighWaterMark();

type stream$writableStreamOptions = {
  highWaterMark?: number,
  decodeString?: boolean,
  objectMode?: boolean
};

type GateOption = {} | stream$writableStreamOptions;

export type Gate = ((data: any) => any)
    | ((data: any) => Promise<any>)
    | stream$Readable
    | stream$Writable
    | stream$Transform;

type GateTuple = [Gate, GateOption];

export type Hole = {
  pipe: (Gate, GateOption) => Hole,
  pieces: () => Hole,
  start: () => Promise<any>
};

export function holeWithStream(readable: stream$Readable): Hole {
  const gates = [[readable, {}]];
  return createInstance(gates);
}

export function holeWithArray(array: Array<any>): Hole {
  return holeWithStream(streamify(array));
}

export default function hole(obj: any): Hole {
  return holeWithArray([obj]);
}

function pipe(rest: Array<GateTuple>, newFn: Gate, opts: ?GateOption): Hole {
  return createInstance([...rest, [newFn, opts || {}]]);
}

function createInstance(gates: Array<GateTuple>): Hole {
  return {
    pipe: pipe.bind(null, gates),
    pieces: pieces.bind(null, gates),
    start: start.bind(null, gates),
    // TODO: filter()
  };
}

class SplitTransform extends Transform {
  constructor(opts) {
    super({...opts, objectMode: true});
  }

  // noinspection JSUnusedGlobalSymbols
  _transform(chunks, enc, callback) {
    if (!Array.isArray(chunks)) {
      throw new Error('.pieces() must receive an array from previous function.');
    }
    push.call(this, chunks, 0);
    callback();

    function push(chunks, curr) {
      if (!chunks[curr]) return;
      this.push(chunks[curr]);
      push.call(this, chunks, curr + 1);
    }
  }
}

function pieces(gates: Array<GateTuple>): Hole {
  const t = new SplitTransform();
  return createInstance([...gates, [t, {}]]);
}

function start([[readable], ...rest]: Array<GateTuple>): Promise<void> {
  return new Promise((resolve, reject) => {
    const streams = [
      readable,
      ...(rest.map(([fn, opts]) => {
	if (isStream(fn)) return fn;

	const highWaterMark = opts.highWaterMark || defaultWritableHighWaterMark;
	return parallelTransform(highWaterMark, opts, function (obj, callback) {
	  if (typeof fn !== 'function') throw new Error('cant be reached');
	  const rv = fn.call(this, obj);
	  if (isPromise(rv)) {
	    if (typeof rv.then !== 'function') throw new Error('something wrong');
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

function getDefaultWritableHighWaterMark() {
  const w = new Writable({objectMode: true});
  // Node v9.4.0 or higher only returns number 16
  const rv = w.writableHighWaterMark || 16;
  // $FlowFixMe https://github.com/facebook/flow/pull/5763
  w.destroy();
  return rv;
}
