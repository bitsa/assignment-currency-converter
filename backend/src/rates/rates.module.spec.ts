import { Test, type TestingModule } from '@nestjs/testing';
import nock from 'nock';
import { AppConfigModule } from '../config/app-config.module';
import { RedisModule } from '../redis/redis.module';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import { FakeRedisCommands } from '../testing/fake-redis-commands';
import { sampleSnapshot } from '../testing/rate-snapshots';
import { UpstreamTimeoutError } from './providers/errors/upstream-timeout.error';
import type { RateProvider } from './providers/rate-provider.interface';
import { RatesModule } from './rates.module';
import { RatesService } from './rates.service';
import { RATE_PROVIDER, RATES_REPOSITORY } from './rates.tokens';
import { RATES_CACHE_KEY } from './repository/redis-rates.repository';
import type { RatesRepository } from './repository/rates-repository.interface';

const DEFAULT_ORIGIN = 'https://api.monobank.ua';
const BODY = JSON.stringify([
  { currencyCodeA: 840, currencyCodeB: 980, date: 1789113600, rateBuy: 41.1, rateSell: 41.6 },
]);

async function moduleWithDefaults(redis = new FakeRedisCommands()): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [AppConfigModule, RedisModule, RatesModule],
  })
    .overrideProvider(REDIS_CLIENT)
    .useValue(redis)
    .compile();
}

async function providerWithDefaults(): Promise<RateProvider> {
  const moduleRef = await moduleWithDefaults();
  return moduleRef.get<RateProvider>(RATE_PROVIDER);
}

describe('RatesModule', () => {
  const saved = {
    MONOBANK_BASE_URL: process.env['MONOBANK_BASE_URL'],
    MONOBANK_TIMEOUT_MS: process.env['MONOBANK_TIMEOUT_MS'],
    RATES_CACHE_TTL_SECONDS: process.env['RATES_CACHE_TTL_SECONDS'],
  };

  beforeAll(() => {
    for (const name of Object.keys(saved)) {
      delete process.env[name];
    }
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value !== undefined) {
        process.env[name] = value;
      }
    }
    nock.enableNetConnect();
  });

  it('requests https://api.monobank.ua/bank/currency when MONOBANK_BASE_URL is unset', async () => {
    const scope = nock(DEFAULT_ORIGIN).get('/bank/currency').reply(200, BODY);
    const provider = await providerWithDefaults();

    await provider.getRates();

    expect(scope.isDone()).toBe(true);
  });

  it('rejects with UpstreamTimeoutError no earlier than 3000 ms and no later than 3500 ms when MONOBANK_TIMEOUT_MS is unset', async () => {
    nock(DEFAULT_ORIGIN).get('/bank/currency').delay(8000).reply(200, BODY);
    const provider = await providerWithDefaults();

    const started = Date.now();
    const error = await provider.getRates().catch((caught: unknown) => caught);
    const elapsed = Date.now() - started;

    expect(error).toBeInstanceOf(UpstreamTimeoutError);
    expect(elapsed).toBeGreaterThanOrEqual(3000);
    expect(elapsed).toBeLessThanOrEqual(3500);
  }, 10_000);

  it('resolves a response delayed by 2500 ms when MONOBANK_TIMEOUT_MS is unset', async () => {
    nock(DEFAULT_ORIGIN).get('/bank/currency').delay(2500).reply(200, BODY);
    const provider = await providerWithDefaults();

    const snapshot = await provider.getRates();

    expect(snapshot.rates).toHaveLength(1);
  }, 10_000);

  it('uses a 300 second key expiry and freshness window when RATES_CACHE_TTL_SECONDS is unset', async () => {
    const redis = new FakeRedisCommands();
    const moduleRef = await moduleWithDefaults(redis);
    const repository = moduleRef.get<RatesRepository>(RATES_REPOSITORY);
    const service = moduleRef.get(RatesService);

    await repository.set(sampleSnapshot(new Date(Date.now() - 299_000)));
    const withinWindow = await service.getRates();
    expect(redis.set).toHaveBeenLastCalledWith(RATES_CACHE_KEY, expect.any(String), 'EX', 300);

    await repository.set(sampleSnapshot(new Date(Date.now() - 301_000)));
    const scope = nock(DEFAULT_ORIGIN).get('/bank/currency').reply(200, BODY);
    const pastWindow = await service.getRates();

    expect([withinWindow.source, pastWindow.source]).toEqual(['cache', 'live']);
    expect(scope.isDone()).toBe(true);
    expect(redis.expirySecondsOf(RATES_CACHE_KEY)).toBe(300);
  });
});
