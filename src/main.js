// @flow

import pump from 'pump';
import streamify from 'stream-array';
import isStream from 'is-stream';
import {Transform, Writable} from 'stream';
import LazyPromise from 'lazy-promise';
import HoleTransform from './hole-transform';

export type Processor = ((data: any) => (any | Promise<any>))
    | stream$Transform
    | stream$Writable;

export type ProcessorOption = {
  maxParallel?: number,
  highWaterMark?: number,
};

export type ProcessorInfo = [Processor, ProcessorOption];

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
  _procInfoArray: Array<ProcessorInfo>;

  constructor(readable: stream$Readable) {
    super(start);
    this._readable = readable;
    this._procInfoArray = [];
  }

  pipe(p: Processor, opts?: ProcessorOption | number): Hole {
    const options = typeof opts === 'number' ? {maxParallel: opts}
        : opts || {};
    this._procInfoArray = [...this._procInfoArray, [p, options]];
    return this;
  }

  split() {
    const p = new Transform({
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
    this._procInfoArray = [...this._procInfoArray, [p, {}]];
    return this;
  }

  lineup(size: number) {
    let buffered = [];
    const p = new Transform({
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
    this._procInfoArray = [...this._procInfoArray, [p, {}]];
    return this;
  }
}

function start(resolve: Function, reject: Function) {
  if (this._procInfoArray.length <= 0) {
    throw new Error('Hole requires at least one ".pipe(fn)" call.');
  }
  const transforms = this._procInfoArray.map(toStream);
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

