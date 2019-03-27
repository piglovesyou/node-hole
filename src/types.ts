// @flow

// export type ProcessorValue<U> = U | Promise<U> | null | void | Promise<null> | Promise<void> ;
export type Processor<T, U> = ((param0: T) => U | undefined) | stream$Transform | stream$Writable;
export interface ProcessorOption {
  maxParallel?: number;
  highWaterMark?: number;
}
export type ProcessorInfo = [Processor<any, any>, ProcessorOption];
