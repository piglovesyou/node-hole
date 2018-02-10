// @flow

import isPromise from 'is-promise';
import pump from 'pump';
import streamify from 'stream-array';
import isStream from 'is-stream';
import parallelTransform from 'parallel-transform';
import {Transform, Writable} from 'stream';
import LazyPromise from 'lazy-promise';

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

function createTransform(opts, fn, finalize) {
  return parallelTransform(opts.highWaterMark || defaultWritableHighWaterMark, opts, function (obj, callback) {
    if (typeof fn !== 'function') throw new Error('cant be reached');
    const rv = fn.call(this, obj);

    if (isPromise(rv)) {
      if (typeof rv.then !== 'function') throw new Error('cant be reached');
      rv.then(resolved => {
	finalize(obj, resolved, callback);
      });
      return;
    }
    finalize(obj, rv, callback);
  });
}

export class Hole extends LazyPromise {

  _readable: stream$Readable;

  _gates: Array<GateInfo>;

  _stop: boolean;

  constructor(readable: stream$Readable) {
    super(_start);

    this._readable = readable;

    function _start(resolve: Function, reject: Function) {
      // const [[readable], ...rest] = this._gates;
      const streams = [
	this._readable,
	...(this._gates.map((gate, i, gates) => toStream(gate, i === gates.length - 1))),
	(error) => {
	  if (error) reject(error); else resolve();
	}
      ];

      function toStream([fn, opts], isLast) {
	if (isStream(fn)) return fn;

	return createTransform(opts, fn, (passed, resolved, callback) => {
	  // Last transform should behave writable stream so that it's never stuck
	  if (isLast) {
	    callback();
	    return;
	  }
	  callback(null,  resolved);
	});
      }

      pump.apply(null, streams);
    }

    this._gates = [];
    setImmediate(() => {
      if (this._stop === true) return;
      this.then(noop);
    });
  }

  pipe(gate: Gate, opts: GateOption = {}): Hole {
    this._gates = [...this._gates, [gate, opts]];
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
    this._gates = [...this._gates, [gate, {}]];
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
    this._gates = [...this._gates, [t, {}]];
    return this;
  }

  // TODO: want something like
  // hole().collect(3).pipe(([v1, v2, v3] => {...})
  stop(): Hole {
    this._stop = true;
    return this;
  }

  start(): Hole {
    this.then(noop);
    return this;
  }
}

function noop() {}

function getDefaultWritableHighWaterMark() {
  const w = new Writable({objectMode: true});
  // Node v9.4.0 or higher only returns number 16
  const rv = w.writableHighWaterMark || 16;
  // $FlowFixMe https://github.com/facebook/flow/pull/5763
  w.destroy();
  return rv;
}
