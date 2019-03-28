import ParallelTransform from 'parallel-transform-stream';
import { Processor, ProcessorOption } from './types';

export class HoleTransform extends ParallelTransform {
  constructor(asyncFn: Processor<any, any>, options?: ProcessorOption) {
    super({
      ...options,
      objectMode: true,
      transform: undefined,
      flush: undefined,
    });

    // Ugly hack for ParallelTransform emitting `finish`
    // when it **starts consuming last task**, not completes it.
    // `pump` uses the event to call a callback afterward
    // where we finish the whole streaming. See
    // https://github.com/ubilabs/node-parallel-transform-stream/issues/2
    this.finished = false;
    this.consumingLength = 0;
    this.asyncFn = asyncFn;
  }

  _parallelTransform(data: any, enc: any, callback: any) {
    this.consumingLength++;
    try {
      const rv = this.asyncFn(data);
      Promise.resolve(rv)
        .then((resolved) => {
          callback(null, resolved);
          this.consumingLength--;
          if (this.finished && this.consumingLength === 0) {
            setImmediate(() => {
              super.emit('finish');
            });
          }
        })
        .catch(callback);
    } catch (err) {
      callback(err);
    }
  }

  // noinspection JSUnusedGlobalSymbols
  public emit(...args: any[]) {
    const [type] = args;
    if (type === 'finish') {
      this.finished = true;
      return;
    }
    return super.emit.apply(this, args);
  }
}
