import { FakeRedisCommands } from '../testing/fake-redis-commands';
import { sampleSnapshot } from '../testing/rate-snapshots';
import { UpstreamHttpError } from './providers/errors/upstream-http.error';
import type { RateSnapshot } from './rate.types';
import type { RateSource, RatesResult } from './rates-result.types';
import { RatesService } from './rates.service';
import { CacheUnavailableError } from './repository/errors/cache-unavailable.error';
import { InMemoryRatesRepository } from './repository/in-memory-rates.repository';
import type { RatesRepository } from './repository/rates-repository.interface';
import { RATES_CACHE_KEY, RedisRatesRepository } from './repository/redis-rates.repository';

const NOW = new Date('2026-09-11T08:00:05.000Z');
const TTL_SECONDS = 300;

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every pending promise chain run; setImmediate is left real for this. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function secondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

describe('RatesService', () => {
  let provider: { getRates: jest.Mock<Promise<RateSnapshot>, []> };
  let logger: { log: jest.Mock; warn: jest.Mock };

  function events(level: 'log' | 'warn', event: string): Record<string, unknown>[] {
    return logger[level].mock.calls
      .map(([fields]) => fields as Record<string, unknown>)
      .filter((fields) => fields.event === event);
  }

  function serviceOver(repository: RatesRepository, ttlSeconds = TTL_SECONDS): RatesService {
    return new RatesService(repository, provider, { ttlSeconds }, logger);
  }

  function redisRepository(redis: FakeRedisCommands, ttlSeconds = TTL_SECONDS): RatesRepository {
    return new RedisRatesRepository(redis, { ttlSeconds }, { warn: jest.fn() });
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    provider = {
      getRates: jest.fn<Promise<RateSnapshot>, []>(() =>
        Promise.resolve(sampleSnapshot(new Date())),
      ),
    };
    logger = { log: jest.fn(), warn: jest.fn() };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('with a fake repository', () => {
    let repository: InMemoryRatesRepository;
    let service: RatesService;

    beforeEach(() => {
      repository = new InMemoryRatesRepository({ ttlSeconds: TTL_SECONDS });
      jest.spyOn(repository, 'read');
      jest.spyOn(repository, 'set');
      service = serviceOver(repository);
    });

    describe('cache-aside', () => {
      it('calls the provider once when the repository holds no snapshot', async () => {
        await service.getRates();

        expect(provider.getRates).toHaveBeenCalledTimes(1);
      });

      it("returns the provider's snapshot with source live when the repository holds no snapshot", async () => {
        const fetched = sampleSnapshot(NOW);
        provider.getRates.mockResolvedValueOnce(fetched);

        const result = await service.getRates();

        expect(result.snapshot).toBe(fetched);
        expect(result.source).toBe('live');
      });

      it('writes the fetched snapshot to the repository before resolving', async () => {
        const fetched = sampleSnapshot(NOW);
        provider.getRates.mockResolvedValueOnce(fetched);
        const write = deferred<void>();
        jest.mocked(repository.set).mockReturnValueOnce(write.promise);
        let resolved = false;

        const pending = service.getRates().then((result) => {
          resolved = true;
          return result;
        });
        await flush();

        expect(repository.set).toHaveBeenCalledWith(fetched);
        expect(resolved).toBe(false);
        write.resolve();
        await pending;
        expect(resolved).toBe(true);
      });

      it('does not call the provider while the stored snapshot is within the freshness window', async () => {
        await repository.set(sampleSnapshot(NOW));
        await jest.advanceTimersByTimeAsync(100_000);

        await service.getRates();

        expect(provider.getRates).not.toHaveBeenCalled();
      });

      it('returns the stored snapshot with source cache while it is within the freshness window', async () => {
        const stored = sampleSnapshot(NOW);
        await repository.set(stored);

        const result = await service.getRates();

        expect(result.source).toBe('cache');
        expect(result.snapshot.rates).toEqual(stored.rates);
      });

      it('returns the stored fetchedAt on a cache hit, not the time of the call', async () => {
        await repository.set(sampleSnapshot(NOW));
        await jest.advanceTimersByTimeAsync(120_000);

        const result = await service.getRates();

        expect(result.source).toBe('cache');
        expect(result.snapshot.fetchedAt.toISOString()).toBe(NOW.toISOString());
      });

      it('returns cache on a second call made within the freshness window after a live call', async () => {
        const first = await service.getRates();
        await jest.advanceTimersByTimeAsync(10_000);
        const second = await service.getRates();

        expect([first.source, second.source]).toEqual(['live', 'cache']);
      });

      it('calls the provider and returns live when the stored snapshot is older than the freshness window', async () => {
        await repository.set(sampleSnapshot(secondsAgo(TTL_SECONDS + 1)));

        const result = await service.getRates();

        expect(provider.getRates).toHaveBeenCalledTimes(1);
        expect(result.source).toBe('live');
      });

      it('returns cache when the stored snapshot is exactly as old as the freshness window', async () => {
        await repository.set(sampleSnapshot(secondsAgo(TTL_SECONDS)));

        const result = await service.getRates();

        expect(result.source).toBe('cache');
      });

      it('rejects with the same UpstreamError instance when the provider rejects on a miss', async () => {
        const failure = new UpstreamHttpError(502);
        provider.getRates.mockRejectedValueOnce(failure);

        await expect(rejection(service.getRates())).resolves.toBe(failure);
      });

      it('writes nothing to the repository when the provider rejects', async () => {
        provider.getRates.mockRejectedValueOnce(new UpstreamHttpError(502));

        await rejection(service.getRates());

        expect(repository.set).not.toHaveBeenCalled();
      });
    });

    describe('single-flight', () => {
      function tenCalls(): Promise<PromiseSettledResult<RatesResult>[]> {
        return Promise.allSettled(Array.from({ length: 10 }, () => service.getRates()));
      }

      it('calls the provider once for 10 concurrent calls on an empty repository', async () => {
        await tenCalls();

        expect(provider.getRates).toHaveBeenCalledTimes(1);
      });

      it('returns the same snapshot with source live to all 10 concurrent calls', async () => {
        const fetched = sampleSnapshot(NOW);
        provider.getRates.mockResolvedValueOnce(fetched);

        const results = await tenCalls();

        expect(results).toHaveLength(10);
        for (const result of results) {
          expect(result.status).toBe('fulfilled');
          const value = (result as PromiseFulfilledResult<RatesResult>).value;
          expect(value.snapshot).toBe(fetched);
          expect(value.source).toBe('live');
        }
      });

      it('writes to the repository once for 10 concurrent calls sharing one fetch', async () => {
        await tenCalls();

        expect(repository.set).toHaveBeenCalledTimes(1);
      });

      it("rejects all 10 concurrent calls with the provider's error when the shared fetch fails", async () => {
        const failure = new UpstreamHttpError(503);
        provider.getRates.mockRejectedValueOnce(failure);

        const results = await tenCalls();

        for (const result of results) {
          expect(result).toEqual({ status: 'rejected', reason: failure });
        }
      });

      it('calls the provider again on the next call after a shared fetch has failed', async () => {
        provider.getRates.mockRejectedValueOnce(new UpstreamHttpError(503));
        await tenCalls();

        const next = await service.getRates();

        expect(provider.getRates).toHaveBeenCalledTimes(2);
        expect(next.source).toBe('live');
      });

      it("joins the in-flight fetch when a call's read misses while a fetch is in flight", async () => {
        const fetch = deferred<RateSnapshot>();
        provider.getRates.mockReturnValueOnce(fetch.promise);

        const first = service.getRates();
        await flush();
        const second = service.getRates();
        await flush();

        expect(repository.read).toHaveBeenCalledTimes(2);
        expect(provider.getRates).toHaveBeenCalledTimes(1);
        const fetched = sampleSnapshot(NOW);
        fetch.resolve(fetched);
        const results = await Promise.all([first, second]);
        expect(results.map((result) => [result.snapshot, result.source])).toEqual([
          [fetched, 'live'],
          [fetched, 'live'],
        ]);
      });

      it('serves a call from cache without joining an earlier fetch once that fetch and its write have finished', async () => {
        const first = await service.getRates();

        const second = await service.getRates();

        expect(provider.getRates).toHaveBeenCalledTimes(1);
        expect([first.source, second.source]).toEqual(['live', 'cache']);
      });

      it('logs exactly one rates.upstream_call for 10 concurrent calls sharing one fetch', async () => {
        await tenCalls();

        expect(events('log', 'rates.upstream_call')).toHaveLength(1);
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('hands every concurrent caller a snapshot whose rates cannot be modified', async () => {
        const live = await tenCalls();
        const cached = await tenCalls();

        const values = [...live, ...cached].map(
          (result) => (result as PromiseFulfilledResult<RatesResult>).value,
        );
        expect(values.map((value) => value.source)).toEqual([
          ...Array<RateSource>(10).fill('live'),
          ...Array<RateSource>(10).fill('cache'),
        ]);
        for (const value of values) {
          expect(Object.isFrozen(value)).toBe(true);
          expect(Object.isFrozen(value.snapshot)).toBe(true);
          expect(Object.isFrozen(value.snapshot.rates)).toBe(true);
          expect(value.snapshot.rates.every((rate) => Object.isFrozen(rate))).toBe(true);
        }
      });
    });

    describe('cache failures', () => {
      it('fetches from the provider and returns live when the repository read fails', async () => {
        jest
          .mocked(repository.read)
          .mockRejectedValueOnce(new CacheUnavailableError('read', 'failed'));

        const result = await service.getRates();

        expect(provider.getRates).toHaveBeenCalledTimes(1);
        expect(result.source).toBe('live');
      });

      it('logs one warn cache.error with operation read when the repository read fails', async () => {
        jest
          .mocked(repository.read)
          .mockRejectedValueOnce(new CacheUnavailableError('read', 'failed'));

        await service.getRates();

        expect(events('warn', 'cache.error')).toEqual([
          { event: 'cache.error', operation: 'read', reason: 'Redis read failed' },
        ]);
      });

      it('returns the fetched snapshot with source live when the repository write fails', async () => {
        const fetched = sampleSnapshot(NOW);
        provider.getRates.mockResolvedValueOnce(fetched);
        jest
          .mocked(repository.set)
          .mockRejectedValueOnce(new CacheUnavailableError('write', 'failed'));

        const result = await service.getRates();

        expect(result.snapshot).toBe(fetched);
        expect(result.source).toBe('live');
      });

      it('logs one warn cache.error with operation write when the repository write fails', async () => {
        jest
          .mocked(repository.set)
          .mockRejectedValueOnce(new CacheUnavailableError('write', 'timed out'));

        await service.getRates();

        expect(events('warn', 'cache.error')).toEqual([
          { event: 'cache.error', operation: 'write', reason: 'Redis write timed out' },
        ]);
      });

      it('serves the next call from cache once a failed repository read works again', async () => {
        await repository.set(sampleSnapshot(NOW));
        jest
          .mocked(repository.read)
          .mockRejectedValueOnce(new CacheUnavailableError('read', 'failed'));
        jest
          .mocked(repository.set)
          .mockRejectedValueOnce(new CacheUnavailableError('write', 'failed'));

        const first = await service.getRates();
        await jest.advanceTimersByTimeAsync(1000);
        const second = await service.getRates();

        expect([first.source, second.source]).toEqual(['live', 'cache']);
        expect(second.snapshot.fetchedAt.toISOString()).toBe(NOW.toISOString());
      });
    });

    describe('logging', () => {
      it('logs one info rates.cache_hit with the stored fetchedAt when a call is served from cache', async () => {
        await repository.set(sampleSnapshot(NOW));
        await jest.advanceTimersByTimeAsync(30_000);

        await service.getRates();

        expect(events('log', 'rates.cache_hit')).toEqual([
          { event: 'rates.cache_hit', fetchedAt: NOW.toISOString() },
        ]);
      });

      it('logs one info rates.cache_miss with reason absent when nothing is stored', async () => {
        await service.getRates();

        expect(events('log', 'rates.cache_miss')).toEqual([
          { event: 'rates.cache_miss', reason: 'absent' },
        ]);
      });

      it('logs one info rates.cache_miss with reason expired when the stored snapshot is too old', async () => {
        await repository.set(sampleSnapshot(secondsAgo(TTL_SECONDS + 60)));

        await service.getRates();

        expect(events('log', 'rates.cache_miss')).toEqual([
          { event: 'rates.cache_miss', reason: 'expired' },
        ]);
      });

      it('logs one info rates.cache_miss with reason corrupt when the stored value is corrupt', async () => {
        jest.mocked(repository.read).mockResolvedValueOnce({ status: 'corrupt' });

        await service.getRates();

        expect(events('log', 'rates.cache_miss')).toEqual([
          { event: 'rates.cache_miss', reason: 'corrupt' },
        ]);
      });

      it('logs one info rates.cache_miss with reason error when the repository read fails', async () => {
        jest
          .mocked(repository.read)
          .mockRejectedValueOnce(new CacheUnavailableError('read', 'failed'));

        await service.getRates();

        expect(events('log', 'rates.cache_miss')).toEqual([
          { event: 'rates.cache_miss', reason: 'error' },
        ]);
      });
    });

    describe('freshness boundaries', () => {
      it('decides freshness from fetchedAt, not from when the snapshot was written', async () => {
        await repository.set(sampleSnapshot(secondsAgo(200)));
        await jest.advanceTimersByTimeAsync(150_000);

        const result = await service.getRates();

        expect(result.source).toBe('live');
      });

      it('returns live 1.5 seconds after a live call when the freshness window is 1 second', async () => {
        const shortService = serviceOver(new InMemoryRatesRepository({ ttlSeconds: 1 }), 1);

        const first = await shortService.getRates();
        await jest.advanceTimersByTimeAsync(1500);
        const second = await shortService.getRates();

        expect([first.source, second.source]).toEqual(['live', 'live']);
      });
    });
  });

  describe('over the Redis repository', () => {
    let redis: FakeRedisCommands;
    let service: RatesService;

    beforeEach(() => {
      redis = new FakeRedisCommands();
      service = serviceOver(redisRepository(redis));
    });

    it('fetches from the provider and returns live when the stored value is corrupt', async () => {
      redis.putString(RATES_CACHE_KEY, '{"rates":[');

      const result = await service.getRates();

      expect(provider.getRates).toHaveBeenCalledTimes(1);
      expect(result.source).toBe('live');
    });

    it('replaces a corrupt stored value so the next call returns cache', async () => {
      redis.putString(RATES_CACHE_KEY, '{"rates":[');

      const first = await service.getRates();
      const second = await service.getRates();

      expect([first.source, second.source]).toEqual(['live', 'cache']);
    });

    it('treats a snapshot whose fetchedAt is older than the freshness window as a miss while the key still exists', async () => {
      await redisRepository(redis).set(sampleSnapshot(secondsAgo(TTL_SECONDS + 100)));
      expect(redis.valueOf(RATES_CACHE_KEY)).toBeDefined();

      const result = await service.getRates();

      expect(result.source).toBe('live');
    });

    it("resolves live within the provider's duration plus 2000 ms while every Redis command hangs", async () => {
      const providerMs = 500;
      provider.getRates.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(sampleSnapshot(new Date())), providerMs);
          }),
      );
      redis.hang();
      let settled: RatesResult | undefined;
      void service.getRates().then((result) => {
        settled = result;
      });

      await jest.advanceTimersByTimeAsync(providerMs + 2000);

      expect(settled?.source).toBe('live');
    });

    it('calls the provider on each of two sequential calls while Redis is unreachable', async () => {
      redis.disconnect();

      const first = await service.getRates();
      const second = await service.getRates();

      expect(provider.getRates).toHaveBeenCalledTimes(2);
      expect([first.source, second.source]).toEqual(['live', 'live']);
    });

    it('stores the snapshot on the first live fetch after Redis recovers so the following call returns cache', async () => {
      redis.disconnect();
      await service.getRates();
      redis.recover();

      const afterRecovery = await service.getRates();
      const following = await service.getRates();

      expect([afterRecovery.source, following.source]).toEqual(['live', 'cache']);
      expect(redis.valueOf(RATES_CACHE_KEY)).toBeDefined();
    });

    it('returns live when the Redis connection drops between the read and the write', async () => {
      const fetched = sampleSnapshot(NOW);
      provider.getRates.mockImplementationOnce(() => {
        redis.disconnect();
        return Promise.resolve(fetched);
      });

      const result = await service.getRates();

      expect(result.snapshot).toBe(fetched);
      expect(result.source).toBe('live');
      expect(events('warn', 'cache.error')).toEqual([
        { event: 'cache.error', operation: 'write', reason: 'Redis write failed' },
      ]);
    });

    it("rejects with the provider's UpstreamError, not a cache error, when Redis is unreachable and the provider rejects", async () => {
      const failure = new UpstreamHttpError(500);
      provider.getRates.mockRejectedValueOnce(failure);
      redis.disconnect();

      await expect(rejection(service.getRates())).resolves.toBe(failure);
    });

    it('keeps the Redis password and the stored JSON out of cache.error log lines', async () => {
      redis.failWith(new Error('connect ECONNREFUSED redis://user:secret@redis:6379'));
      await service.getRates();
      const leaky = new InMemoryRatesRepository({ ttlSeconds: TTL_SECONDS });
      jest
        .spyOn(leaky, 'read')
        .mockRejectedValueOnce(
          new Error('redis://user:secret@redis:6379 {"rates":[{"buy":"41.1"}]}'),
        );
      await serviceOver(leaky).getRates();

      const warnings = events('warn', 'cache.error');
      expect(warnings.length).toBeGreaterThanOrEqual(3);
      expect(warnings).toContainEqual({
        event: 'cache.error',
        operation: 'read',
        reason: 'repository failure',
      });
      const logged = JSON.stringify([logger.warn.mock.calls, logger.log.mock.calls]);
      expect(logged).not.toContain('secret');
      expect(logged).not.toContain('41.1');
    });
  });

  describe.each([
    ['InMemoryRatesRepository', () => new InMemoryRatesRepository({ ttlSeconds: TTL_SECONDS })],
    ['RedisRatesRepository', () => redisRepository(new FakeRedisCommands())],
  ] as const)('with the %s', (_label, create) => {
    it('returns live on a miss, cache on a hit, live once the TTL has passed and live after clear', async () => {
      await expect(sourceSequence(create())).resolves.toEqual(['live', 'cache', 'live', 'live']);
    });
  });

  it('produces the same source sequence with the in-memory and the Redis repository', async () => {
    const inMemory = await sourceSequence(new InMemoryRatesRepository({ ttlSeconds: TTL_SECONDS }));
    const overRedis = await sourceSequence(redisRepository(new FakeRedisCommands()));

    expect(overRedis).toEqual(inMemory);
    expect(inMemory).toEqual(['live', 'cache', 'live', 'live']);
  });

  /** Miss, hit, TTL passes, then the repository is cleared behind the service's back. */
  async function sourceSequence(repository: RatesRepository): Promise<RateSource[]> {
    const service = serviceOver(repository);
    const sources: RateSource[] = [];
    sources.push((await service.getRates()).source);
    sources.push((await service.getRates()).source);
    await jest.advanceTimersByTimeAsync(TTL_SECONDS * 1000 + 1);
    sources.push((await service.getRates()).source);
    await repository.clear();
    sources.push((await service.getRates()).source);
    return sources;
  }
});
