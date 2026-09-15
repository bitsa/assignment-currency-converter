import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BASE_URL, tryGet } from './helpers/http';
import { BASE_STACK_ENV, TEST_STACK_ENV, reset, state } from './helpers/mock';
import { redisCli } from './helpers/redis';
import { REPO_ROOT, type RunOptions } from './helpers/run';
import { compose, expectHealthy } from './helpers/stack';
import { delay, pollUntil } from './helpers/wait';

// Precondition: the test stack is up. Restarts `app` and leaves app, redis and the mock healthy.
const IN_TEST_STACK: RunOptions = { env: TEST_STACK_ENV };
const RATES_KEY = 'rates:monobank:v1';

interface ComposeConfig {
  readonly services: Readonly<
    Record<string, { readonly environment?: Readonly<Record<string, unknown>> }>
  >;
}

async function composeConfig(env: Readonly<Record<string, string>>): Promise<ComposeConfig> {
  const result = await compose(['config', '--format', 'json'], { env });
  if (result.code !== 0) {
    throw new Error(`docker compose config failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as ComposeConfig;
}

async function keyExists(): Promise<string> {
  const result = await redisCli(['EXISTS', RATES_KEY]);
  if (result.code !== 0) {
    throw new Error(`redis-cli EXISTS failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

describe('Rates cache in the test stack', () => {
  beforeAll(async () => {
    await expectHealthy(['app', 'redis', 'monobank-mock'], 120_000, IN_TEST_STACK);
  }, 150_000);

  afterAll(async () => {
    await compose(['start', 'app', 'redis', 'monobank-mock'], IN_TEST_STACK);
    await expectHealthy(['app', 'redis', 'monobank-mock'], 120_000, IN_TEST_STACK);
    await redisCli(['DEL', RATES_KEY]);
    await reset();
  }, 150_000);

  it('sets RATES_CACHE_TTL_SECONDS to 5 for the app in the test stack and leaves it unset in the base stack', async () => {
    const testConfig = await composeConfig(TEST_STACK_ENV);
    const baseConfig = await composeConfig(BASE_STACK_ENV);
    const printed = await compose(
      ['exec', '-T', 'app', 'printenv', 'RATES_CACHE_TTL_SECONDS'],
      IN_TEST_STACK,
    );

    expect(testConfig.services.app?.environment?.RATES_CACHE_TTL_SECONDS).toBe('5');
    expect(printed.code).toBe(0);
    expect(printed.stdout.trim()).toBe('5');
    expect(Object.keys(baseConfig.services.app?.environment ?? {})).not.toContain(
      'RATES_CACHE_TTL_SECONDS',
    );
    expect(JSON.stringify(testConfig)).not.toContain('RATES_STALE_TTL_SECONDS');
    expect(JSON.stringify(baseConfig)).not.toContain('RATES_STALE_TTL_SECONDS');
  });

  it('writes no rates key to Redis and calls no upstream while the app boots to a healthy /health', async () => {
    expect((await compose(['stop', 'app'], IN_TEST_STACK)).code).toBe(0);
    expect((await redisCli(['DEL', RATES_KEY])).code).toBe(0);
    await reset();
    expect(await keyExists()).toBe('0');
    expect((await state()).requests).toBe(0);

    expect((await compose(['start', 'app'], IN_TEST_STACK)).code).toBe(0);
    const healthy = await pollUntil(
      async () => ((await tryGet(BASE_URL, '/health', 5000))?.status === 200 ? true : undefined),
      90_000,
    );
    // Longer than the test stack's 5 second TTL, so a write at boot could not have expired unseen.
    await delay(6000);
    const scan = await redisCli(['--scan', '--pattern', 'rates:*']);

    expect(healthy).toBe(true);
    expect(await keyExists()).toBe('0');
    expect((await state()).requests).toBe(0);
    expect(scan.code).toBe(0);
    expect(scan.stdout.trim()).toBe('');
  }, 150_000);

  it('documents RATES_CACHE_TTL_SECONDS with default 300 and integer ≥ 1 in the README and .env.example', async () => {
    const readme = await readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
    const envExample = await readFile(path.join(REPO_ROOT, '.env.example'), 'utf8');
    const row = readme.split('\n').find((line) => line.startsWith('| `RATES_CACHE_TTL_SECONDS` '));

    expect(row).toBeDefined();
    expect(row).toContain('`300`');
    expect(row).toMatch(/integer ≥ `?1`?(?!\d)/);
    expect(envExample).toMatch(/^RATES_CACHE_TTL_SECONDS=300$/m);
  });
});
