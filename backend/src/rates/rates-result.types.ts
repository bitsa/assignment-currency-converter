import type { RateSnapshot } from './rate.types';

/** Where a snapshot handed to a caller came from. */
export type RateSource = 'cache' | 'live';

export interface RatesResult {
  readonly snapshot: RateSnapshot;
  readonly source: RateSource;
}
