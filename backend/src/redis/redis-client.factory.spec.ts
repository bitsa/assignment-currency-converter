import type { Redis } from 'ioredis';
import { createRedisClient } from './redis-client.factory';
import { RedisConnectionMonitor } from './redis-connection-monitor';

describe('createRedisClient', () => {
  let client: Redis | undefined;

  afterEach(() => {
    client?.disconnect();
    client = undefined;
  });

  it('fails Redis commands immediately instead of queueing them while disconnected', async () => {
    // Loopback port 1 refuses connections, so the client never reaches `ready`.
    client = createRedisClient(
      'redis://127.0.0.1:1',
      new RedisConnectionMonitor({ log: jest.fn(), warn: jest.fn() }),
    );
    const startedAt = Date.now();

    await expect(client.ping()).rejects.toThrow(/enableOfflineQueue/);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});
