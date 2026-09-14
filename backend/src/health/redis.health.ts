import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.tokens';

export const REDIS_PING_TIMEOUT_MS = 2000;

export type RedisPing = Pick<Redis, 'ping'>;

const TIMED_OUT = Symbol('TIMED_OUT');

/** Adapts a Redis PING to a Terminus health result. Messages are fixed strings: no error text. */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisPing,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check(key);
    let timer: NodeJS.Timeout | undefined;
    try {
      const reply: unknown = await Promise.race([
        this.redis.ping(),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), REDIS_PING_TIMEOUT_MS);
        }),
      ]);
      if (reply === TIMED_OUT) {
        return indicator.down({
          message: `Redis did not answer PING within ${REDIS_PING_TIMEOUT_MS} ms`,
        });
      }
      if (reply !== 'PONG') {
        return indicator.down({ message: 'Unexpected Redis PING reply' });
      }
      return indicator.up();
    } catch {
      return indicator.down({ message: 'Redis PING failed' });
    } finally {
      clearTimeout(timer);
    }
  }
}
