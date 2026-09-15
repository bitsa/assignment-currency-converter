export interface RatesCacheOptions {
  /** Freshness window measured from `fetchedAt`, and the key expiry until stale serving exists. */
  readonly ttlSeconds: number;
}
