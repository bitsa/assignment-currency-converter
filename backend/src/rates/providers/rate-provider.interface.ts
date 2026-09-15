import type { RateSnapshot } from '../rate.types';

/** A source of rate snapshots. Every failure is an `UpstreamError`. */
export interface RateProvider {
  getRates(): Promise<RateSnapshot>;
}
