import type Joi from 'joi';
import { ENV_VALIDATION_OPTIONS, type Env, envSchema } from './env.schema';

type RawEnv = Record<string, string>;

function validate(raw: RawEnv): Joi.ValidationResult<Env> {
  return envSchema.validate(raw, ENV_VALIDATION_OPTIONS);
}

const ACCEPTED: readonly (readonly [string, string])[] = [
  ['PORT', '1'],
  ['PORT', '3000'],
  ['PORT', '65535'],
  ['NODE_ENV', 'development'],
  ['NODE_ENV', 'test'],
  ['NODE_ENV', 'production'],
  ['LOG_LEVEL', 'fatal'],
  ['LOG_LEVEL', 'error'],
  ['LOG_LEVEL', 'warn'],
  ['LOG_LEVEL', 'info'],
  ['LOG_LEVEL', 'debug'],
  ['LOG_LEVEL', 'trace'],
  ['LOG_LEVEL', 'silent'],
  ['REDIS_URL', 'redis://redis:6379'],
  ['REDIS_URL', 'rediss://cache.example.com:6380'],
  ['REDIS_URL', 'redis://:s3cret-pw@redis:6379'],
  ['MONOBANK_BASE_URL', 'http://monobank-mock:8081/'],
  ['MONOBANK_BASE_URL', 'https://api.monobank.ua'],
  ['MONOBANK_BASE_URL', 'https://user:secret@host'],
  ['MONOBANK_TIMEOUT_MS', '100'],
  ['MONOBANK_TIMEOUT_MS', '3000'],
];

const REJECTED: readonly (readonly [string, string])[] = [
  ['PORT', '0'],
  ['PORT', '65536'],
  ['PORT', '-1'],
  ['PORT', '3000.5'],
  ['PORT', 'abc'],
  ['PORT', ''],
  ['NODE_ENV', 'staging'],
  ['NODE_ENV', 'Production'],
  ['NODE_ENV', ''],
  ['LOG_LEVEL', 'verbose'],
  ['LOG_LEVEL', 'INFO'],
  ['LOG_LEVEL', ''],
  ['REDIS_URL', 'not-a-url'],
  ['REDIS_URL', 'http://redis:6379'],
  ['REDIS_URL', ''],
  ['MONOBANK_BASE_URL', ''],
  ['MONOBANK_BASE_URL', 'not-a-url'],
  ['MONOBANK_BASE_URL', 'ftp://api.monobank.ua'],
  ['MONOBANK_BASE_URL', 'redis://x'],
  ['MONOBANK_TIMEOUT_MS', ''],
  ['MONOBANK_TIMEOUT_MS', 'abc'],
  ['MONOBANK_TIMEOUT_MS', '99'],
  ['MONOBANK_TIMEOUT_MS', '1500.5'],
  ['MONOBANK_TIMEOUT_MS', '-1'],
];

const ALL_NAMES = [
  'PORT',
  'NODE_ENV',
  'LOG_LEVEL',
  'REDIS_URL',
  'MONOBANK_BASE_URL',
  'MONOBANK_TIMEOUT_MS',
] as const;

describe('envSchema', () => {
  it('applies the defaults 3000, development, info, redis://redis:6379, https://api.monobank.ua and 3000 when nothing is set', () => {
    const { error, value } = validate({});

    expect(error).toBeUndefined();
    expect(value).toEqual({
      PORT: 3000,
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      REDIS_URL: 'redis://redis:6379',
      MONOBANK_BASE_URL: 'https://api.monobank.ua',
      MONOBANK_TIMEOUT_MS: 3000,
    });
  });

  it('validates an environment with no Monobank variables', () => {
    const { error } = validate({
      PORT: '3000',
      NODE_ENV: 'production',
      REDIS_URL: 'redis://redis:6379',
    });

    expect(error).toBeUndefined();
  });

  it('accepts PORT=4000 and converts it to the number 4000', () => {
    const { error, value } = validate({ PORT: '4000' });

    expect(error).toBeUndefined();
    expect(value).toMatchObject({ PORT: 4000 });
  });

  it.each(ACCEPTED)('accepts %s=%p', (name, raw) => {
    const { error } = validate({ [name]: raw });

    expect(error).toBeUndefined();
  });

  it.each(REJECTED)('rejects %s=%p', (name, raw) => {
    const { error } = validate({ [name]: raw });

    expect(error).toBeDefined();
  });

  it.each(REJECTED)('names %s in the error when it holds %p', (name, raw) => {
    const { error } = validate({ [name]: raw });

    expect(error?.message).toContain(`"${name}"`);
  });

  it.each(ALL_NAMES)('rejects an empty %s and names it in the error', (name) => {
    const { error } = validate({ [name]: '' });

    expect(error?.message).toContain(`"${name}"`);
  });

  it('names every invalid variable when several are invalid at once', () => {
    const { error } = validate({
      PORT: 'abc',
      NODE_ENV: 'staging',
      LOG_LEVEL: 'loud',
      REDIS_URL: 'http://redis:6379',
      MONOBANK_BASE_URL: 'ftp://api.monobank.ua',
      MONOBANK_TIMEOUT_MS: '99',
    });

    expect(error?.details.map((detail) => detail.context?.key)).toEqual(ALL_NAMES);
    for (const name of ALL_NAMES) {
      expect(error?.message).toContain(`"${name}"`);
    }
  });

  it('ignores variables the schema does not define', () => {
    const { error } = validate({ FOO: 'bar', PATH: '/usr/bin' });

    expect(error).toBeUndefined();
  });
});
