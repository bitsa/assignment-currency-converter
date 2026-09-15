import type { LoggerService } from '@nestjs/common';
import type { RateProvider } from './providers/rate-provider.interface';
import type { RateSnapshot } from './rate.types';
import type { RatesResult } from './rates-result.types';
import { cacheErrorReason } from './repository/errors/cache-unavailable.error';
import type { RatesCacheOptions } from './repository/rates-cache-options.interface';
import type { RatesRepository, SnapshotRead } from './repository/rates-repository.interface';

export type RatesServiceLogger = Pick<LoggerService, 'log' | 'warn'>;

type MissReason = 'absent' | 'expired' | 'corrupt' | 'error';

/**
 * Cache-aside over the rates repository and provider. A fresh stored snapshot is served as
 * `cache`; otherwise one fetch per process is shared by every concurrent miss, written to the
 * repository and served as `live`. The cache never fails a call: its errors are logged and the
 * call proceeds live.
 */
export class RatesService {
  private inFlight: Promise<RateSnapshot> | undefined;

  constructor(
    private readonly repository: RatesRepository,
    private readonly provider: RateProvider,
    private readonly options: RatesCacheOptions,
    private readonly logger: RatesServiceLogger,
  ) {}

  async getRates(): Promise<RatesResult> {
    const read = await this.readRepository();
    let reason: MissReason;
    if (read === undefined) {
      reason = 'error';
    } else if (read.status !== 'hit') {
      reason = read.status;
    } else if (this.isFresh(read.snapshot)) {
      this.logger.log(
        { event: 'rates.cache_hit', fetchedAt: read.snapshot.fetchedAt.toISOString() },
        'Rates served from cache',
      );
      return Object.freeze({ snapshot: read.snapshot, source: 'cache' });
    } else {
      reason = 'expired';
    }
    this.logger.log({ event: 'rates.cache_miss', reason }, 'No fresh rates in cache');
    const snapshot = await this.sharedFetch();
    return Object.freeze({ snapshot, source: 'live' });
  }

  private async readRepository(): Promise<SnapshotRead | undefined> {
    try {
      return await this.repository.read();
    } catch (error) {
      this.logger.warn(
        { event: 'cache.error', operation: 'read', reason: cacheErrorReason(error) },
        'Rate cache read failed',
      );
      return undefined;
    }
  }

  /** Age from `fetchedAt`; exactly the TTL is still fresh. A future `fetchedAt` counts as fresh. */
  private isFresh(snapshot: RateSnapshot): boolean {
    return Date.now() - snapshot.fetchedAt.getTime() <= this.options.ttlSeconds * 1000;
  }

  /** Joins the fetch in flight, if any. It is cleared only once its write has settled. */
  private sharedFetch(): Promise<RateSnapshot> {
    this.inFlight ??= this.fetchAndStore().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async fetchAndStore(): Promise<RateSnapshot> {
    this.logger.log({ event: 'rates.upstream_call' }, 'Fetching rates from the upstream');
    const snapshot = await this.provider.getRates();
    try {
      await this.repository.set(snapshot);
    } catch (error) {
      this.logger.warn(
        { event: 'cache.error', operation: 'write', reason: cacheErrorReason(error) },
        'Rate cache write failed',
      );
    }
    return snapshot;
  }
}
