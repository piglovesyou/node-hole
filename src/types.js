// @flow

// export type ProcessorValue<U> = U | Promise<U> | null | void | Promise<null> | Promise<void> ;

export type Processor<T, U> =
    | (T => ?U)
    | stream$Transform
    | stream$Writable;

export type ProcessorOption = {
  maxParallel?: number,
  highWaterMark?: number,
};

export type ProcessorInfo = [Processor<any, any>, ProcessorOption];
