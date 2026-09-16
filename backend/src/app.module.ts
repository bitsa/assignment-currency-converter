import { Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE, HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ConversionModule } from './conversion/conversion.module';
import { LoggingModule } from './common/logging/logging.module';
import { createValidationPipe } from './common/validation/validation-pipe.factory';
import { AppConfigModule } from './config/app-config.module';
import { HealthModule } from './health/health.module';
import { RatesModule } from './rates/rates.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    RedisModule,
    RatesModule,
    ConversionModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    {
      provide: APP_FILTER,
      inject: [HttpAdapterHost],
      useFactory: (adapterHost: HttpAdapterHost): AllExceptionsFilter =>
        new AllExceptionsFilter(adapterHost, new Logger('AllExceptionsFilter')),
    },
  ],
})
export class AppModule {}
