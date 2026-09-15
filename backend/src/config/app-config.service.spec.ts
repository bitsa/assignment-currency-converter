import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppConfigService } from './app-config.service';
import { ENV_VALIDATION_OPTIONS, type Env, envSchema } from './env.schema';

async function configFor(raw: Record<string, string>): Promise<AppConfigService> {
  const { error, value } = envSchema.validate(raw, ENV_VALIDATION_OPTIONS);
  if (error) {
    throw error;
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      AppConfigService,
      { provide: ConfigService, useValue: new ConfigService<Env, true>(value) },
    ],
  }).compile();
  return moduleRef.get(AppConfigService);
}

describe('AppConfigService', () => {
  it('exposes the validated port as a number', async () => {
    const config = await configFor({ PORT: '4000' });

    expect(config.port).toBe(4000);
  });

  it('exposes the validated NODE_ENV, LOG_LEVEL and REDIS_URL values', async () => {
    const config = await configFor({
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      REDIS_URL: 'rediss://cache.example.com:6380',
    });

    expect([config.nodeEnv, config.logLevel, config.redisUrl]).toEqual([
      'test',
      'warn',
      'rediss://cache.example.com:6380',
    ]);
  });

  it('exposes MONOBANK_BASE_URL as a string and MONOBANK_TIMEOUT_MS as a number', async () => {
    const config = await configFor({
      MONOBANK_BASE_URL: 'http://monobank-mock:8081',
      MONOBANK_TIMEOUT_MS: '1500',
    });

    expect(config.monobankBaseUrl).toBe('http://monobank-mock:8081');
    expect(config.monobankTimeoutMs).toBe(1500);
  });

  it('exposes RATES_CACHE_TTL_SECONDS as a number', async () => {
    const config = await configFor({ RATES_CACHE_TTL_SECONDS: '5' });

    expect(config.ratesCacheTtlSeconds).toBe(5);
  });
});
