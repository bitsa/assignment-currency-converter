import { EventEmitter } from 'node:events';
import { redactCredentials, RedisConnectionMonitor } from './redis-connection-monitor';

function connectionRefused(message = 'connect ECONNREFUSED 172.18.0.2:6379'): Error {
  return Object.assign(new Error(message), { code: 'ECONNREFUSED' });
}

function monitoredClient(): {
  readonly client: EventEmitter;
  readonly logger: { readonly log: jest.Mock; readonly warn: jest.Mock };
} {
  const client = new EventEmitter();
  const logger = { log: jest.fn(), warn: jest.fn() };
  new RedisConnectionMonitor(logger).attach(client);
  return { client, logger };
}

describe('RedisConnectionMonitor', () => {
  it('handles connection errors so an unreachable Redis never crashes the process', () => {
    const { client } = monitoredClient();

    expect(() => client.emit('error', connectionRefused())).not.toThrow();
  });

  it('never logs the Redis password, even when an error message contains the connection URL', () => {
    const { client, logger } = monitoredClient();

    client.emit('error', connectionRefused('failed to reach redis://:s3cret-pw@redis:6379'));
    client.emit('ready');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([logger.warn.mock.calls, logger.log.mock.calls])).not.toContain(
      's3cret-pw',
    );
  });

  it('masks the password in a redis:// or rediss:// URL inside a message', () => {
    expect(
      redactCredentials('tried redis://app:pw-one@redis:6379 then rediss://:pw-two@cache:6380/0'),
    ).toBe('tried redis://app:***@redis:6379 then rediss://:***@cache:6380/0');
  });

  it('logs one warning per outage rather than one per reconnect attempt', () => {
    const { client, logger } = monitoredClient();

    client.emit('error', connectionRefused());
    client.emit('error', connectionRefused());
    client.emit('error', connectionRefused());
    expect(logger.warn).toHaveBeenCalledTimes(1);

    client.emit('ready');
    client.emit('error', connectionRefused());
    client.emit('error', connectionRefused());

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});
