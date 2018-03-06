// @flow

import pump from 'pump';
import streamify from 'stream-array';
import isStream from 'is-stream';
import {Transform, Writable} from 'stream';
import LazyPromise from 'lazy-promise';
import HoleTransform from './hole-transform';

export type Gate = ((data: any) => (any | Promise<any>))
    | stream$Transform
    | stream$Writable;

export type GateOption = {
  maxParallel?: number,
  highWaterMark?: number,
};

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

export class Hole extends LazyPromise {
  _readable: stream$Readable;
  _gates: Array<GateInfo>;

  constructor(readable: stream$Readable) {
    super(_start);
    this._readable = readable;
    // We need to make the last gate behave a writable stream. In order to do that,
    // Hole need to store the functions until it starts and turn these to streams later.
    this._gates = [];
  }

  pipe(gate: Gate, opts?: GateOption | number): Hole {
    const options = typeof opts === 'number' ? {maxParallel: opts}
        : opts || {};
    this._gates = [...this._gates, [gate, options]];
    return this;
  }

  split() {
    const gate = new Transform({
      objectMode: true,
      transform(chunks, enc, callback) {
        if (!Array.isArray(chunks)) {
          throw new Error('.split() must receive an array from a previous function.');
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

  lineup(size: number) {
    let buffered = [];
    const gate = new Transform({
      transform(chunk, enc, callback) {
        buffered = [...buffered, chunk];
        if (buffered.length >= size) {
          this.push(buffered);
          buffered = [];
        }
        callback();
      },
      flush(callback) {
        if (buffered.length > 0) {
          this.push(buffered);
        }
        callback();
      },
      objectMode: true,
    });
    this._gates = [...this._gates, [gate, {}]];
    return this;
  }
}

function _start(resolve: Function, reject: Function) {
  if (this._gates.length <= 0) {
    throw new Error('Hole requires at least one ".pipe(fn)" call.');
  }
  const transforms = this._gates.map(toStream); // (gate, i, gates) => toStream(gate, i === gates.length - 1));
  const voidWriter = new Writable({objectMode: true, write(data, enc, callback) { callback(); }});

  const streams = [
    this._readable,
    ...transforms,
    voidWriter
  ];

  pump.apply(null, [
    ...streams,
    (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }
  ]);

  function toStream([fn, opts]) {
    if (isStream(fn)) return fn;

    return new HoleTransform(fn, opts);
  }
}

