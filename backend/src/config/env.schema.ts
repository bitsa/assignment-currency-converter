import Joi from 'joi';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Env {
  readonly PORT: number;
  readonly NODE_ENV: NodeEnv;
  readonly LOG_LEVEL: LogLevel;
  readonly REDIS_URL: string;
}

// Unset → default; empty string → invalid (Joi rejects '' unless explicitly allowed).
// Fixed-set values are matched exactly and case-sensitively.
export const envSchema = Joi.object<Env>({
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  NODE_ENV: Joi.string()
    .valid(...NODE_ENVS)
    .default('development'),
  LOG_LEVEL: Joi.string()
    .valid(...LOG_LEVELS)
    .default('info'),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://redis:6379'),
});

export const ENV_VALIDATION_OPTIONS: Joi.ValidationOptions = {
  abortEarly: false,
  allowUnknown: true,
};
