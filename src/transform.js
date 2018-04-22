// @flow

import ParallelTransform from 'parallel-transform-stream';
import type {Processor, ProcessorOption} from './types';

export default class HoleTransform extends ParallelTransform {
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
    this._finished = false;
    this._consumingLength = 0;
    this._asyncFn = asyncFn;
  }

  // noinspection JSUnusedGlobalSymbols
  _parallelTransform(data: any, enc: any, callback: any) {
    this._consumingLength++;
    try {
      const rv = this._asyncFn(data);
      Promise.resolve(rv)
          .then(resolved => {
            callback(null, resolved);
            this._consumingLength--;
            if (this._finished && this._consumingLength === 0) {
              setImmediate(() => {
                super.emit('finish');
              });
            }
          }).catch(callback);
    } catch (err) {
      callback(err);
    }
  }

  // noinspection JSUnusedGlobalSymbols
  emit(...args: Array<any>) {
    const [type] = args;
    if (type === 'finish') {
      this._finished = true;
      return;
    }
    return super.emit.apply(this, args);
  }

}
