// @flow

import isPromise from 'is-promise';
import pump from 'pump';
import streamify from 'stream-array';
import isStream from 'is-stream';
import parallelTransform from 'parallel-transform';
import {Transform, Writable} from 'stream';

const defaultWritableHighWaterMark = getDefaultWritableHighWaterMark();

// From https://github.com/facebook/flow/blob/v0.64.0/lib/node.js#L1436
type stream$writableStreamOptions = {
  highWaterMark?: number,
  decodeString?: boolean,
  objectMode?: boolean
};

export type GateOption = {} | stream$writableStreamOptions;

export type Gate = ((data: any) => any)
    | ((data: any) => Promise<any>)
    | stream$Readable
    | stream$Writable
    | stream$Transform;

export type GateInfo = [Gate, GateOption];

export function holeWithStream(readable: stream$Readable): Hole {
  return new Hole(readable);
}

export function holeWithArray(array: Array<any>): Hole {
  return holeWithStream(streamify(array));
}

export default function hole(obj: any): Hole {
  return holeWithArray([obj]);
}

export class Hole {

  gates: Array<GateInfo>;

  constructor(readable: stream$Readable) {
    this.gates = [[readable, {}]];
  }

  pipe(gate: Gate, opts: GateOption = {}): Hole {
    this.gates = [...this.gates, [gate, opts]];
    return this;
  }

  pieces() {
    const gate = new Transform({
      objectMode: true,
      transform: function (chunks, enc, callback) {
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
    });
    this.gates = [...this.gates, [gate, {}]];
    return this;
  }

  filter(fn: Gate, opts?: GateOption = {}): Hole {
    if (typeof fn !== 'function') {
      throw new Error('.filter() only accepts function');
    }
    // TODO: Refac duplication of using parallelTransform
    const highWaterMark = opts.highWaterMark || defaultWritableHighWaterMark;
    const t = parallelTransform(highWaterMark, opts, function (obj, callback) {
      if (typeof fn !== 'function') throw new Error('cant be reached');
      const rv = fn.call(this, obj);
      if (isPromise(rv)) {
	if (typeof rv.then !== 'function') throw new Error('cant be reached');
	rv.then(resolved => {
	  if (Boolean(resolved)) {
	    callback(null, obj);
	    return;
	  }
	  callback();
	});
	return;
      }
      if (Boolean(rv)) {
	callback(null, obj);
	return;
      }
      callback();
    });
    this.gates = [...this.gates, [t, {}]];
    return this;
  }

  // TODO: want something like
  // hole().collect(3).pipe(([v1, v2, v3] => {...})

  start(): Promise<void> {
    const [[readable], ...rest] = this.gates;
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
	      if (typeof rv.then !== 'function') throw new Error('cant be reached');
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
}

function getDefaultWritableHighWaterMark() {
  const w = new Writable({objectMode: true});
  // Node v9.4.0 or higher only returns number 16
  const rv = w.writableHighWaterMark || 16;
  // $FlowFixMe https://github.com/facebook/flow/pull/5763
  w.destroy();
  return rv;
}
