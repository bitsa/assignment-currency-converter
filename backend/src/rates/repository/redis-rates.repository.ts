import type { LoggerService } from '@nestjs/common';
import type { RateSnapshot } from '../rate.types';
import {
  CacheUnavailableError,
  cacheErrorReason,
  type CacheOperation,
} from './errors/cache-unavailable.error';
import type { RatesCacheOptions } from './rates-cache-options.interface';
import type { RatesRepository, SnapshotRead } from './rates-repository.interface';
import { parseStoredSnapshot, serializeSnapshot } from './stored-snapshot.codec';

export const RATES_CACHE_KEY = 'rates:monobank:v1';
export const REDIS_COMMAND_TIMEOUT_MS = 1000;

/** The three commands the repository uses; ioredis' `Redis` satisfies it structurally. */
export interface RatesRedisCommands {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, secondsToken: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<number>;
}

export type RepositoryLogger = Pick<LoggerService, 'warn'>;

type StoredReply =
  { readonly kind: 'text'; readonly text: string | null } | { readonly kind: 'wrong type' };

const ABSENT: SnapshotRead = Object.freeze({ status: 'absent' });
const CORRUPT: SnapshotRead = Object.freeze({ status: 'corrupt' });

/**
 * Rate snapshot in one Redis string with an `EX` expiry. Every command is bounded by its own
 * timeout; the client-wide `commandTimeout` is not used, so the health check's PING keeps its
 * own limit. Every failure becomes a `CacheUnavailableError` with fixed wording.
 */
export class RedisRatesRepository implements RatesRepository {
  constructor(
    private readonly redis: RatesRedisCommands,
    private readonly options: RatesCacheOptions,
    private readonly logger: RepositoryLogger,
  ) {}

  async get(): Promise<RateSnapshot | null> {
    const read = await this.read();
    return read.status === 'hit' ? read.snapshot : null;
  }

  async read(): Promise<SnapshotRead> {
    const reply = await this.command('read', () =>
      this.redis.get(RATES_CACHE_KEY).then(
        (text): StoredReply => ({ kind: 'text', text }),
        (error: unknown): StoredReply => {
          // A key of another Redis type would fail every read forever; treat it as corrupt.
          if (error instanceof Error && error.message.startsWith('WRONGTYPE')) {
            return { kind: 'wrong type' };
          }
          throw error;
        },
      ),
    );
    if (reply.kind === 'text') {
      if (reply.text === null) {
        return ABSENT;
      }
      const snapshot = parseStoredSnapshot(reply.text);
      if (snapshot !== null) {
        return { status: 'hit', snapshot };
      }
    }
    return this.discardCorrupt();
  }

  async set(snapshot: RateSnapshot): Promise<void> {
    const value = serializeSnapshot(snapshot);
    await this.command('write', () =>
      this.redis.set(RATES_CACHE_KEY, value, 'EX', this.options.ttlSeconds),
    );
  }

  async clear(): Promise<void> {
    await this.command('delete', () => this.redis.del(RATES_CACHE_KEY));
  }

  private async discardCorrupt(): Promise<SnapshotRead> {
    this.logger.warn({ event: 'rates.cache_corrupt' }, 'Discarded a corrupt cached rate snapshot');
    try {
      await this.clear();
    } catch (error) {
      this.logger.warn(
        {
          event: 'cache.error',
          operation: 'delete',
          reason: cacheErrorReason(error),
        },
        'Rate cache delete failed',
      );
    }
    return CORRUPT;
  }

  /** Runs one command against the timeout; any rejection or no reply is a cache failure. */
  private async command<T>(operation: CacheOperation, run: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new CacheUnavailableError(operation, 'timed out')),
        REDIS_COMMAND_TIMEOUT_MS,
      );
    });
    try {
      // Promise.race subscribes to the command, so a rejection after the timeout is handled.
      return await Promise.race([run(), timeout]);
    } catch (error) {
      // Never the Redis error text: it can carry the connection URL.
      throw error instanceof CacheUnavailableError
        ? error
        : new CacheUnavailableError(operation, 'failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
