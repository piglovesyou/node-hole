import pump from 'pump';
import streamify from 'stream-array';
import isStream from 'is-stream';
import { Readable, Transform, Writable } from 'stream';
import LazyPromise from 'lazy-promise';
import { HoleTransform } from './transform';
import { Processor, ProcessorInfo, ProcessorOption } from './types';

export function fromStream(readable: Readable): Hole<any> {
  return new Hole(readable);
}

export function fromArray<T>(array: T[]): Hole<T> {
  return fromStream(streamify(array));
}

export default function hole<T>(obj: T): Hole<T> {
  return fromArray([obj]);
}

interface AsyncFunction {
  addClickListener(onclick: (this: void, e: Event) => void): void;
}

type ArrayElement<ArrayType> = ArrayType extends (infer ElementType)[] ? ElementType : never;

export class Hole<T> extends LazyPromise<T> {
  private readonly readable: Readable;
  private procInfoArray: ProcessorInfo[];

  constructor(readable: Readable) {
    super(start);
    this.readable = readable;
    this.procInfoArray = [];
  }

  public pipe(p: Readable): Hole<any>;
  public pipe(p: Writable): Hole<any>;
  public pipe<U>(p: (this: Transform, arg: T) => Promise<U>, opts?: ProcessorOption | number): Hole<Exclude<NonNullable<U>, void>>;
  public pipe<U>(p: (this: Transform, arg: T) => U , opts?: ProcessorOption | number): Hole<Exclude<NonNullable<U>, void>>;
  public pipe(p: any, opts?: any): any {
    const options: ProcessorOption = typeof opts === 'number' ? { maxParallel: opts } : opts || {};
    this.procInfoArray = [...this.procInfoArray, [p, options]];
    return this as any;
  }

  public split<U = ArrayElement<T>>(): Hole<U> {
    const p = new Transform({
      objectMode: true,
      transform: function (chunks, enc, callback) {
        if (!Array.isArray(chunks)) {
          throw new Error('.split() must receive an array from a previous function.');
        }
        push.call(this, callback, chunks, 0);

        function push(callback: any, chunks: any, curr: number) {
          if (chunks[curr] === undefined) {
            callback();
            return;
          }
          // @ts-ignore
          const bufferAvailable = this.push(chunks[curr]);
          if (bufferAvailable) {
            // @ts-ignore
            push.call(this, callback, chunks, curr + 1);
            return;
          }
          // Avoid synchronous pushing over capacity of readable buffer
          setImmediate(() => {
            // @ts-ignore
            push.call(this, callback, chunks, curr + 1);
          });
        }
      },
    });

    this.procInfoArray = [...this.procInfoArray, [p, {}]];
    return this as any;
  }

  public concat(size: number): Hole<T[]> {
    let buffered: T[] = [];
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
    const results: T[] = [];
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
  // @ts-ignore
  if (this.procInfoArray.length <= 0) {
    throw new Error('Hole requires at least one ".pipe(fn)" call.');
  }
  // @ts-ignore
  const transforms = this.procInfoArray.map(toStream);
  const voidWriter = new Writable({
    objectMode: true,
    write(data, enc, callback) {
      callback();
    },
  });

  // @ts-ignore
  const streams = [this.readable, ...transforms, voidWriter];

  pump.apply(null, [
    ...streams,
    (error: any) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    },
  ]);

  function toStream([fn, opts]: [any, any]) {
    if (isStream(fn)) return fn;

    return new HoleTransform(fn, opts);
  }
}
