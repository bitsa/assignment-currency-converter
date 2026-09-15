import { Test } from '@nestjs/testing';
import nock from 'nock';
import { AppConfigModule } from '../config/app-config.module';
import { UpstreamTimeoutError } from './providers/errors/upstream-timeout.error';
import type { RateProvider } from './providers/rate-provider.interface';
import { RatesModule } from './rates.module';
import { RATE_PROVIDER } from './rates.tokens';

const DEFAULT_ORIGIN = 'https://api.monobank.ua';
const BODY = JSON.stringify([
  { currencyCodeA: 840, currencyCodeB: 980, date: 1789113600, rateBuy: 41.1, rateSell: 41.6 },
]);

async function providerWithDefaults(): Promise<RateProvider> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppConfigModule, RatesModule],
  }).compile();
  return moduleRef.get<RateProvider>(RATE_PROVIDER);
}

describe('RatesModule', () => {
  const saved = {
    MONOBANK_BASE_URL: process.env['MONOBANK_BASE_URL'],
    MONOBANK_TIMEOUT_MS: process.env['MONOBANK_TIMEOUT_MS'],
  };

  beforeAll(() => {
    delete process.env['MONOBANK_BASE_URL'];
    delete process.env['MONOBANK_TIMEOUT_MS'];
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
});
