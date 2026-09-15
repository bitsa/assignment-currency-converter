import type { RateSnapshot } from '../rate.types';

/** One read of the stored snapshot, keeping why nothing came back. */
export type SnapshotRead =
  | { readonly status: 'hit'; readonly snapshot: RateSnapshot }
  /** Nothing stored, or the stored copy has expired. */
  | { readonly status: 'absent' }
  /** The stored value was corrupt; the implementation has removed it. */
  | { readonly status: 'corrupt' };

/** Storage for the one current rate snapshot. Every store failure is a `CacheUnavailableError`. */
export interface RatesRepository {
  /** Stored snapshot, or null when it is absent, expired or corrupt. */
  get(): Promise<RateSnapshot | null>;
  /** Same read as `get()`, keeping why nothing came back. */
  read(): Promise<SnapshotRead>;
  /** Stores the snapshot with the configured expiry, replacing any previous one. */
  set(snapshot: RateSnapshot): Promise<void>;
  /** Removes the snapshot; resolves whether or not one existed. */
  clear(): Promise<void>;
}
