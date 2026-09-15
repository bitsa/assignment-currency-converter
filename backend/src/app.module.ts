import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module';
import { AppConfigModule } from './config/app-config.module';
import { HealthModule } from './health/health.module';
import { RatesModule } from './rates/rates.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [AppConfigModule, LoggingModule, RedisModule, RatesModule, HealthModule],
})
export class AppModule {}
