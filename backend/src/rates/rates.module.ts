import { HttpModule, HttpService } from '@nestjs/axios';
import { Logger, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type { MonobankProviderOptions } from './providers/monobank/monobank-provider-options.interface';
import { MonobankRateProvider } from './providers/monobank/monobank-rate.provider';
import type { RateProvider } from './providers/rate-provider.interface';
import { MONOBANK_PROVIDER_OPTIONS, RATE_PROVIDER } from './rates.tokens';

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
  ],
  exports: [RATE_PROVIDER],
})
export class RatesModule {}
