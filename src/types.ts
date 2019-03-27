import {Transform, Writable} from 'stream';

export type Processor<T, U> = ((param0: T) => U | void) | Transform | Writable;
export interface ProcessorOption {
  maxParallel?: number;
  highWaterMark?: number;
}
export type ProcessorInfo = [Processor<any, any>, ProcessorOption];
