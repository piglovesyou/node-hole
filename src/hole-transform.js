import ParallelTransform from 'parallel-transform-stream';
import {Writable} from 'stream';

const defaultWritableHighWaterMark = getDefaultWritableHighWaterMark();

export default class HoleTransform extends ParallelTransform {
  constructor(asyncFn, options) {

    super({
      maxParallel: defaultWritableHighWaterMark,
      highWaterMark: defaultWritableHighWaterMark,
      ...options,
      objectMode: true,
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
  _parallelTransform(data, enc, callback) {
    this._consumingLength++;
    const rv = this._asyncFn.call(this, data);
    Promise.resolve(rv)
        .then(resolved => {
          callback(null, resolved);
          this._consumingLength--;
          if (this._finished && this._consumingLength === 0) {
            setImmediate(() => {
              return super.emit('finish');
            });
          }
        });
  }

  emit(...args) {
    const [type] = args;
    if (type === 'finish') {
      this._finished = true;
      return;
    }
    return super.emit.apply(this, args);
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
