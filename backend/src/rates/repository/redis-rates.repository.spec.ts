import { FakeRedisCommands } from '../../testing/fake-redis-commands';
import { sampleSnapshot } from '../../testing/rate-snapshots';
import { describeRatesRepositoryContract } from '../../testing/rates-repository-contract';
import { CacheUnavailableError } from './errors/cache-unavailable.error';
import { RATES_CACHE_KEY, RedisRatesRepository } from './redis-rates.repository';

const NOW = new Date('2026-09-11T08:00:05.000Z');
const TTL_SECONDS = 300;

const VALID_RATE = { base: 'USD', quote: 'UAH', buy: '41.1', asOf: '2026-09-11T08:00:00.000Z' };

function stored(overrides: { rate?: Record<string, unknown>; fetchedAt?: unknown }): string {
  return JSON.stringify({
    rates: [overrides.rate ?? VALID_RATE],
    fetchedAt: overrides.fetchedAt ?? '2026-09-11T08:00:05.000Z',
  });
}

describeRatesRepositoryContract(
  'RedisRatesRepository',
  (options) => new RedisRatesRepository(new FakeRedisCommands(), options, { warn: jest.fn() }),
);

describe('RedisRatesRepository', () => {
  let redis: FakeRedisCommands;
  let warn: jest.Mock;
  let repository: RedisRatesRepository;

  type Operation = 'get' | 'set' | 'clear';
  const OPERATIONS: readonly Operation[] = ['get', 'set', 'clear'];

  function run(operation: Operation): Promise<unknown> {
    switch (operation) {
      case 'get':
        return repository.get();
      case 'set':
        return repository.set(sampleSnapshot(NOW));
      case 'clear':
        return repository.clear();
    }
  }

  async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error('expected the promise to reject');
  }

  function warnEvents(event: string): unknown[][] {
    const calls: unknown[][] = warn.mock.calls;
    return calls.filter(([fields]) => (fields as { event?: unknown } | undefined)?.event === event);
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    redis = new FakeRedisCommands();
    warn = jest.fn();
    repository = new RedisRatesRepository(redis, { ttlSeconds: TTL_SECONDS }, { warn });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('stored value', () => {
    it('stores the snapshot under rates:monobank:v1 as JSON with decimal strings and ISO timestamps', async () => {
      await repository.set(sampleSnapshot(NOW));

      expect(JSON.parse(redis.valueOf(RATES_CACHE_KEY) ?? 'null')).toEqual({
        rates: [
          {
            base: 'USD',
            quote: 'UAH',
            buy: '41.1',
            sell: '41.6',
            asOf: '2026-09-11T08:00:00.000Z',
          },
          { base: 'GBP', quote: 'UAH', cross: '55.4', asOf: '2026-09-11T05:00:00.000Z' },
          { base: 'KRW', quote: 'UAH', cross: '0.0272', asOf: '2026-09-11T05:00:00.000Z' },
        ],
        fetchedAt: '2026-09-11T08:00:05.000Z',
      });
    });

    it('stores the value and an expiry of the TTL in one SET command with EX', async () => {
      await repository.set(sampleSnapshot(NOW));

      expect(redis.set).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(RATES_CACHE_KEY, expect.any(String), 'EX', 300);
      expect(redis.expirySecondsOf(RATES_CACHE_KEY)).toBe(300);
    });

    it('deletes rates:monobank:v1 on clear', async () => {
      await repository.set(sampleSnapshot(NOW));

      await repository.clear();

      expect(redis.del).toHaveBeenCalledWith(RATES_CACHE_KEY);
      expect(redis.valueOf(RATES_CACHE_KEY)).toBeUndefined();
    });
  });

  describe('store failures', () => {
    it.each(OPERATIONS)(
      'rejects %s with CACHE_UNAVAILABLE and status 503 when the Redis command is rejected',
      async (operation) => {
        redis.failWith(new Error('ERR something went wrong'));

        const error = await rejection(run(operation));

        expect(error).toBeInstanceOf(CacheUnavailableError);
        expect(error).toMatchObject({ code: 'CACHE_UNAVAILABLE', httpStatus: 503 });
      },
    );

    it.each(OPERATIONS)(
      'rejects %s with CACHE_UNAVAILABLE and status 503 while the client is disconnected',
      async (operation) => {
        redis.disconnect();

        const error = await rejection(run(operation));

        expect(error).toBeInstanceOf(CacheUnavailableError);
        expect(error).toMatchObject({ code: 'CACHE_UNAVAILABLE', httpStatus: 503 });
      },
    );

    it.each(OPERATIONS)(
      'rejects %s with CACHE_UNAVAILABLE within 1500 ms when Redis gives no reply for 1000 ms',
      async (operation) => {
        redis.hang();
        let settled: unknown;
        void run(operation).then(
          () => {
            settled = 'resolved';
          },
          (error: unknown) => {
            settled = error;
          },
        );

        await jest.advanceTimersByTimeAsync(999);
        expect(settled).toBeUndefined();
        await jest.advanceTimersByTimeAsync(501);

        expect(settled).toBeInstanceOf(CacheUnavailableError);
        expect(settled).toMatchObject({ code: 'CACHE_UNAVAILABLE', httpStatus: 503 });
        expect(jest.getTimerCount()).toBe(0);
      },
    );

    it('rejects with a message that holds neither the Redis error text nor the stored value', async () => {
      redis.failWith(new Error('connect ECONNREFUSED redis://user:secret@redis:6379'));

      const errors = [await rejection(repository.get()), await rejection(run('set'))];

      for (const error of errors) {
        const message = (error as Error).message;
        expect(message).not.toContain('secret');
        expect(message).not.toContain('ECONNREFUSED');
        expect(message).not.toContain('41.1');
      }
    });
  });

  describe('corrupt stored data', () => {
    it('resolves null from get when the key holds invalid JSON', async () => {
      redis.putString(RATES_CACHE_KEY, '{"rates":[');

      await expect(repository.get()).resolves.toBeNull();
    });

    it('reads corrupt when the key holds invalid JSON', async () => {
      redis.putString(RATES_CACHE_KEY, '{"rates":[');

      await expect(repository.read()).resolves.toEqual({ status: 'corrupt' });
    });

    it('deletes the key when get finds a corrupt value', async () => {
      redis.putString(RATES_CACHE_KEY, '{"rates":[');

      await repository.get();

      expect(redis.del).toHaveBeenCalledWith(RATES_CACHE_KEY);
      expect(redis.valueOf(RATES_CACHE_KEY)).toBeUndefined();
    });

    it.each([
      ['{}', '{}'],
      ['[]', '[]'],
      ['{"rates":[]}', '{"rates":[]}'],
      ['a fetchedAt of yesterday', stored({ fetchedAt: 'yesterday' })],
      ['a buy of -1', stored({ rate: { ...VALID_RATE, buy: '-1' } })],
      ['a buy of 0', stored({ rate: { ...VALID_RATE, buy: '0' } })],
      ['a buy of 41.1 as a JSON number', stored({ rate: { ...VALID_RATE, buy: 41.1 } })],
      ['XAU as base', stored({ rate: { ...VALID_RATE, base: 'XAU' } })],
    ])('resolves null from get when the key holds %s', async (_label, value) => {
      redis.putString(RATES_CACHE_KEY, value);

      await expect(repository.get()).resolves.toBeNull();
    });

    it.each(['hash', 'list'] as const)(
      'resolves null from get and deletes the key when it holds a %s',
      async (type) => {
        if (type === 'hash') {
          redis.putHash(RATES_CACHE_KEY);
        } else {
          redis.putList(RATES_CACHE_KEY);
        }

        await expect(repository.get()).resolves.toBeNull();
        expect(redis.del).toHaveBeenCalledWith(RATES_CACHE_KEY);
        await expect(redis.get(RATES_CACHE_KEY)).resolves.toBeNull();
      },
    );

    it.each(['hash', 'list'] as const)(
      'reads corrupt instead of rejecting when the key holds a %s',
      async (type) => {
        if (type === 'hash') {
          redis.putHash(RATES_CACHE_KEY);
        } else {
          redis.putList(RATES_CACHE_KEY);
        }

        await expect(repository.read()).resolves.toEqual({ status: 'corrupt' });
      },
    );

    it('logs one warn rates.cache_corrupt that does not contain the stored value', async () => {
      const value = stored({ rate: { ...VALID_RATE, buy: '-41.123' } });
      redis.putString(RATES_CACHE_KEY, value);

      await repository.get();

      expect(warnEvents('rates.cache_corrupt')).toHaveLength(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('41.123');
    });

    it('still resolves null from get when deleting a corrupt key fails', async () => {
      redis.putString(RATES_CACHE_KEY, '{"rates":[');
      redis.failWith(new Error('ERR delete refused'), ['del']);

      await expect(repository.get()).resolves.toBeNull();
      expect(warnEvents('cache.error')).toEqual([
        [
          { event: 'cache.error', operation: 'delete', reason: 'Redis delete failed' },
          expect.any(String),
        ],
      ]);
    });
  });
});
