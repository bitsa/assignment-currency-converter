import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env, LogLevel, NodeEnv } from './env.schema';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get nodeEnv(): NodeEnv {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get logLevel(): LogLevel {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get redisUrl(): string {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get monobankBaseUrl(): string {
    return this.config.get('MONOBANK_BASE_URL', { infer: true });
  }

  get monobankTimeoutMs(): number {
    return this.config.get('MONOBANK_TIMEOUT_MS', { infer: true });
  }
}
