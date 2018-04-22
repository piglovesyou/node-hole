// @flow

import pump from 'pump';
import streamify from 'stream-array';
import isStream from 'is-stream';
import {Transform, Writable} from 'stream';
import LazyPromise from 'lazy-promise';
import HoleTransform from './transform';
import type {Processor, ProcessorInfo, ProcessorOption} from './types';

export function fromStream(readable: stream$Readable): Hole<any> {
  return new Hole(readable);
}

export function fromArray<T>(array: Array<T>): Hole<T> {
  return fromStream(streamify(array));
}

export default function hole<T>(obj: T): Hole<T> {
  return fromArray([obj]);
}

export class Hole<T> extends LazyPromise {
  _readable: stream$Readable;
  _procInfoArray: Array<ProcessorInfo>;

  constructor(readable: stream$Readable) {
    super(start);
    this._readable = readable;
    this._procInfoArray = [];
  }

  pipe<U>(p: Processor<T, U>, opts?: (ProcessorOption | number)): Hole<U> {
    const options = typeof opts === 'number' ? {maxParallel: opts} : opts || {};
    this._procInfoArray = [...this._procInfoArray, [p, options]];
    return ((this: any): Hole<U>);
  }

  split(): Hole<$ElementType<T, any>> {
    const p = new Transform({
      objectMode: true,
      transform(chunks, enc, callback) {
        if (!Array.isArray(chunks)) {
          throw new Error('.split() must receive an array from a previous function.');
        }
        push.call(this, callback, chunks, 0);

        function push(callback, chunks, curr) {
          if (chunks[curr] === undefined) {
            callback();
            return;
          }
          const bufferAvailable = this.push(chunks[curr]);
          if (bufferAvailable) {
            push.call(this, callback, chunks, curr + 1);
            return;
          }
          // Avoid synchronous pushing over capacity of readable buffer
          setImmediate(() => {
            push.call(this, callback, chunks, curr + 1);
          });
        }
      }
    });
    this._procInfoArray = [...this._procInfoArray, [p, {}]];
    return (this: any);
  }

  concat(size: number): Hole<Array<T>> {
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
    return ((this: any): Hole<Array<T>>);
  }

  collect(): Array<T> {
    const results = [];
    return this.pipe(data => {
      results.push(data);
    }).then(() => results);
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
