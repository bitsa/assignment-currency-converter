import type { RateSnapshot } from '../rate.types';
import type { RatesCacheOptions } from './rates-cache-options.interface';
import type { RatesRepository, SnapshotRead } from './rates-repository.interface';

interface Stored {
  readonly snapshot: RateSnapshot;
  readonly expiresAtMs: number;
}

/**
 * Per-process repository for tests and as the second implementation behind the contract. Expiry
 * follows Redis `EX`: the snapshot is gone only once more than the TTL has passed since `set`.
 */
export class InMemoryRatesRepository implements RatesRepository {
  private stored: Stored | undefined;

  constructor(private readonly options: RatesCacheOptions) {}

  async get(): Promise<RateSnapshot | null> {
    const read = await this.read();
    return read.status === 'hit' ? read.snapshot : null;
  }

  read(): Promise<SnapshotRead> {
    if (this.stored !== undefined && Date.now() > this.stored.expiresAtMs) {
      this.stored = undefined;
    }
    return Promise.resolve(
      this.stored === undefined
        ? { status: 'absent' }
        : { status: 'hit', snapshot: this.stored.snapshot },
    );
  }

  set(snapshot: RateSnapshot): Promise<void> {
    this.stored = {
      snapshot: Object.freeze({
        rates: Object.freeze([...snapshot.rates]),
        fetchedAt: new Date(snapshot.fetchedAt.getTime()),
      }),
      expiresAtMs: Date.now() + this.options.ttlSeconds * 1000,
    };
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.stored = undefined;
    return Promise.resolve();
  }
}
