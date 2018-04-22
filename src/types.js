// @flow

export type ProcessorValue<U> = U | Promise<U> | Promise<null> | Promise<void> | null | void ;

export type Processor<T, U> = ((data: T) => ProcessorValue<U>)
    | stream$Transform
    | stream$Writable;

export type ProcessorOption = {
  maxParallel?: number,
  highWaterMark?: number,
};

export type ProcessorInfo = [Processor<any, any>, ProcessorOption];
