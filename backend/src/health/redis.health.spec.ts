import { HealthIndicatorService } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import { REDIS_PING_TIMEOUT_MS, RedisHealthIndicator } from './redis.health';

async function indicatorWith(ping: jest.Mock): Promise<RedisHealthIndicator> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HealthIndicatorService,
      RedisHealthIndicator,
      { provide: REDIS_CLIENT, useValue: { ping } },
    ],
  }).compile();
  return moduleRef.get(RedisHealthIndicator);
}

describe('RedisHealthIndicator', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports redis up when PING replies PONG', async () => {
    const indicator = await indicatorWith(jest.fn().mockResolvedValue('PONG'));

    await expect(indicator.isHealthy('redis')).resolves.toEqual({ redis: { status: 'up' } });
  });

  it('reports redis down when PING is rejected', async () => {
    const indicator = await indicatorWith(
      jest.fn().mockRejectedValue(new Error('Connection is closed.')),
    );

    await expect(indicator.isHealthy('redis')).resolves.toEqual({
      redis: { status: 'down', message: 'Redis PING failed' },
    });
  });

  it('reports redis down when PING does not answer within 2 seconds', async () => {
    const indicator = await indicatorWith(jest.fn().mockReturnValue(new Promise(() => undefined)));
    jest.useFakeTimers();

    const result = indicator.isHealthy('redis');
    jest.advanceTimersByTime(REDIS_PING_TIMEOUT_MS);

    expect(REDIS_PING_TIMEOUT_MS).toBe(2000);
    await expect(result).resolves.toEqual({
      redis: { status: 'down', message: 'Redis did not answer PING within 2000 ms' },
    });
  });

  it('reports redis down while the client has never connected', async () => {
    const indicator = await indicatorWith(
      jest
        .fn()
        .mockRejectedValue(
          new Error("Stream isn't writeable and enableOfflineQueue options is false"),
        ),
    );

    await expect(indicator.isHealthy('redis')).resolves.toMatchObject({
      redis: { status: 'down' },
    });
  });

  it('reports redis down when PING returns an unexpected reply', async () => {
    const indicator = await indicatorWith(jest.fn().mockResolvedValue('LOADING'));

    await expect(indicator.isHealthy('redis')).resolves.toEqual({
      redis: { status: 'down', message: 'Unexpected Redis PING reply' },
    });
  });

  it('never puts the Redis password in the health message', async () => {
    const indicator = await indicatorWith(
      jest.fn().mockRejectedValue(new Error('connect to redis://:s3cret-pw@redis:6379 failed')),
    );

    const result = await indicator.isHealthy('redis');

    expect(JSON.stringify(result)).not.toContain('s3cret-pw');
  });
});
