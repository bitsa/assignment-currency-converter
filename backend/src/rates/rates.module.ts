import { HttpModule, HttpService } from '@nestjs/axios';
import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import type { MonobankProviderOptions } from './providers/monobank/monobank-provider-options.interface';
import { MonobankRateProvider } from './providers/monobank/monobank-rate.provider';
import type { RateProvider } from './providers/rate-provider.interface';
import { RatesService } from './rates.service';
import {
  MONOBANK_PROVIDER_OPTIONS,
  RATE_PROVIDER,
  RATES_CACHE_OPTIONS,
  RATES_REPOSITORY,
} from './rates.tokens';
import { RedisRatesRepository } from './repository/redis-rates.repository';
import type { RatesCacheOptions } from './repository/rates-cache-options.interface';
import type { RatesRepository } from './repository/rates-repository.interface';

@Module({
  imports: [HttpModule],
  providers: [
    {
      provide: MONOBANK_PROVIDER_OPTIONS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): MonobankProviderOptions => ({
        baseUrl: config.monobankBaseUrl,
        timeoutMs: config.monobankTimeoutMs,
      }),
    },
    {
      provide: RATE_PROVIDER,
      inject: [HttpService, MONOBANK_PROVIDER_OPTIONS],
      useFactory: (http: HttpService, options: MonobankProviderOptions): RateProvider =>
        new MonobankRateProvider(http, options, new Logger('MonobankRateProvider')),
    },
    {
      provide: RATES_CACHE_OPTIONS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): RatesCacheOptions => ({
        ttlSeconds: config.ratesCacheTtlSeconds,
      }),
    },
    {
      provide: RATES_REPOSITORY,
      inject: [REDIS_CLIENT, RATES_CACHE_OPTIONS],
      useFactory: (redis: Redis, options: RatesCacheOptions): RatesRepository =>
        new RedisRatesRepository(redis, options, new Logger('RedisRatesRepository')),
    },
    {
      provide: RatesService,
      inject: [RATES_REPOSITORY, RATE_PROVIDER, RATES_CACHE_OPTIONS],
      useFactory: (
        repository: RatesRepository,
        provider: RateProvider,
        options: RatesCacheOptions,
      ): RatesService =>
        new RatesService(repository, provider, options, new Logger('RatesService')),
    },
  ],
  exports: [RATE_PROVIDER, RatesService],
})
export class RatesModule {}
