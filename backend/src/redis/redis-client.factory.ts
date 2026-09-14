import { Redis, type RedisOptions } from 'ioredis';
import type { RedisConnectionMonitor } from './redis-connection-monitor';

// Commands fail at once while disconnected instead of waiting in a queue, so callers (the
// health check first) are never stuck behind an outage. Reconnection keeps ioredis' defaults.
export const REDIS_CLIENT_OPTIONS: RedisOptions = { enableOfflineQueue: false };

export function createRedisClient(url: string, monitor: RedisConnectionMonitor): Redis {
  const client = new Redis(url, REDIS_CLIENT_OPTIONS);
  monitor.attach(client);
  return client;
}
