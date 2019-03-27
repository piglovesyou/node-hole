// @flow
import pump from 'pump';
import streamify from 'stream-array';
import isStream from 'is-stream';
import { Transform, Writable } from 'stream';
import LazyPromise from 'lazy-promise';
import { HoleTransform } from './transform';
import { Processor, ProcessorInfo, ProcessorOption } from './types';

export function fromStream(readable: stream$Readable): Hole<any> {
  return new Hole(readable);
}

export function fromArray<T>(array: T[]): Hole<T> {
  return fromStream(streamify(array));
}

export default function hole<T>(obj: T): Hole<T> {
  return fromArray([obj]);
}

export class Hole<T> extends LazyPromise {
  private readonly readable: stream$Readable;
  private readonly procInfoArray: ProcessorInfo[];

  constructor(readable: stream$Readable) {
    super(start);
    this.readable = readable;
    this.procInfoArray = [];
  }

  public pipe<U, V>(
    p: Processor<T, U>,
    opts?: ProcessorOption | number,
  ): $Call<
    ((param0: stream$Readable) => Hole<any>) &
      ((param0: stream$Writable) => Hole<any>) &
      ((
        param0: Function,
      ) => $Call<((param0: Promise<V | undefined>) => Hole<V>) & ((param0: V | undefined) => Hole<V>), U>),
    Processor<T, U>
  > {
    const options: ProcessorOption = typeof opts === 'number' ? { maxParallel: opts } : opts || {};
    this.procInfoArray = [...this.procInfoArray, [p, options]];
    return this as any;
  }

  public split(): Hole<T[number]> {
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
      },
    });

    this.procInfoArray = [...this.procInfoArray, [p, {}]];
    return this as any;
  }

  public concat(size: number): Hole<T[]> {
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

    this.procInfoArray = [...this.procInfoArray, [p, {}]];
    return (this as any) as Hole<T[]>;
  }

  public collect(): Promise<T[]> {
    // noinspection JSMismatchedCollectionQueryUpdate
    const results = [];
    return this.pipe((data) => {
      results.push(data);
    }).then(() => results);
  }

  public collectSet(): Promise<Set<T>> {
    const results = new Set();
    return this.pipe((data) => {
      results.add(data);
    }).then(() => results);
  }
}

function start(resolve: Function, reject: Function) {
  if (this.procInfoArray.length <= 0) {
    throw new Error('Hole requires at least one ".pipe(fn)" call.');
  }
  const transforms = this.procInfoArray.map(toStream);
  const voidWriter = new Writable({
    objectMode: true,
    write(data, enc, callback) {
      callback();
    },
  });

  const streams = [this.readable, ...transforms, voidWriter];

  pump.apply(null, [
    ...streams,
    (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    },
  ]);

  function toStream([fn, opts]) {
    if (isStream(fn)) return fn;

    return new HoleTransform(fn, opts);
  }
}
