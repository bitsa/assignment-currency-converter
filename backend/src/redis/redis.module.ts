import { Global, Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import { createRedisClient } from './redis-client.factory';
import { RedisConnectionMonitor } from './redis-connection-monitor';
import { REDIS_CLIENT } from './redis.tokens';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Redis =>
        createRedisClient(config.redisUrl, new RedisConnectionMonitor(new Logger('Redis'))),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Pick<Redis, 'disconnect'>) {}

  /** Stops ioredis' reconnect timers so a closed app leaves no socket or timer behind. */
  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
