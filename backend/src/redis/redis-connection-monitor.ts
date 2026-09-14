import type { LoggerService } from '@nestjs/common';
import type { EventEmitter } from 'node:events';

export type ConnectionLogger = Pick<LoggerService, 'log' | 'warn'>;

const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]*):[^@/\s]*@/gi;

/** Masks the password of every `scheme://user:password@` occurrence in the text. */
export function redactCredentials(text: string): string {
  return text.replace(URL_USERINFO, '$1$2:***@');
}

/**
 * Observes an ioredis client's connection events. Listening to `error` keeps an unreachable
 * Redis from crashing the process; logging happens on state transitions only, because ioredis
 * emits `error` on every reconnect attempt.
 */
export class RedisConnectionMonitor {
  private inOutage = false;

  constructor(private readonly logger: ConnectionLogger) {}

  attach(client: EventEmitter): void {
    client.on('error', (error: unknown) => this.onError(error));
    client.on('ready', () => this.onReady());
  }

  private onError(error: unknown): void {
    if (this.inOutage) {
      return;
    }
    this.inOutage = true;
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    this.logger.warn(
      { event: 'redis.connection_error', code, reason: redactCredentials(message) },
      'Redis connection error',
    );
  }

  private onReady(): void {
    this.inOutage = false;
    this.logger.log({ event: 'redis.ready' }, 'Redis connection ready');
  }
}
