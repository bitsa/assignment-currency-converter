import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { F_EXAMPLE } from './fixtures/monobank';
import { BASE_URL, tryGet } from './helpers/http';
import {
  BASE_STACK_ENV,
  TEST_STACK_ENV,
  getCurrency,
  mockRequest,
  reset,
  setFixture,
  setMode,
  state,
} from './helpers/mock';
import { REPO_ROOT, type RunOptions } from './helpers/run';
import { compose, expectHealthy } from './helpers/stack';
import { delay, pollUntil } from './helpers/wait';

// Precondition: the test stack is up. Restarts `app` and `monobank-mock` and leaves both healthy.
const IN_TEST_STACK: RunOptions = { env: TEST_STACK_ENV };

interface ComposeService {
  readonly environment?: Readonly<Record<string, unknown>>;
  readonly healthcheck?: unknown;
  readonly depends_on?: Readonly<Record<string, { readonly condition?: string }>>;
  readonly ports?: readonly {
    readonly target?: number;
    readonly published?: string | number;
    readonly host_ip?: string;
  }[];
}

interface ComposeConfig {
  readonly services: Readonly<Record<string, ComposeService>>;
}

async function composeConfig(env: Readonly<Record<string, string>>): Promise<ComposeConfig> {
  const result = await compose(['config', '--format', 'json'], { env });
  if (result.code !== 0) {
    throw new Error(`docker compose config failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as ComposeConfig;
}

async function services(env: Readonly<Record<string, string>>): Promise<string[]> {
  const result = await compose(['config', '--services'], { env });
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort();
}

function tableRow(markdown: string, variable: string): string | undefined {
  return markdown.split('\n').find((line) => line.startsWith(`| \`${variable}\``));
}

describe('Monobank mock in the Compose stacks', () => {
  let defaultFixture: unknown;

  beforeAll(async () => {
    await expectHealthy(['app', 'redis', 'monobank-mock'], 120_000, IN_TEST_STACK);
    await reset();
    defaultFixture = JSON.parse((await getCurrency()).text) as unknown;
    await reset();
  }, 150_000);

  afterAll(async () => {
    await compose(['start', 'app', 'monobank-mock'], IN_TEST_STACK);
    await expectHealthy(['app', 'redis', 'monobank-mock'], 120_000, IN_TEST_STACK);
    await reset();
  }, 150_000);

  it('reports app, redis and monobank-mock healthy in the test stack, with a healthcheck on the mock', async () => {
    await expectHealthy(['app', 'redis', 'monobank-mock'], 120_000, IN_TEST_STACK);

    const config = await composeConfig(TEST_STACK_ENV);
    expect(config.services['monobank-mock']?.healthcheck).toBeDefined();
  }, 150_000);

  it('publishes the mock on 127.0.0.1:8081 only, with the host port taken from MONOBANK_MOCK_HOST_PORT', async () => {
    const stateResponse = await mockRequest('GET', '/__admin/state');
    const port = await compose(['port', 'monobank-mock', '8081'], IN_TEST_STACK);
    const config = await composeConfig({ ...TEST_STACK_ENV, MONOBANK_MOCK_HOST_PORT: '18081' });
    const ports = (config.services['monobank-mock']?.ports ?? []).map((entry) => ({
      target: entry.target,
      published: String(entry.published),
      host_ip: entry.host_ip,
    }));

    expect(stateResponse.status).toBe(200);
    expect(port.stdout.trim()).toBe('127.0.0.1:8081');
    expect(ports).toEqual([{ target: 8081, published: '18081', host_ip: '127.0.0.1' }]);
  });

  it('serves the fixture to GET $MONOBANK_BASE_URL/bank/currency from inside the app container, which starts after the mock is healthy', async () => {
    const script = [
      'const base = process.env.MONOBANK_BASE_URL;',
      'console.log(base);',
      "fetch(base + '/bank/currency')",
      '  .then(async (r) => { console.log(r.status); console.log(await r.text()); })',
      '  .catch((e) => { console.error(e); process.exit(1); });',
    ].join('\n');

    const result = await compose(['exec', '-T', 'app', 'node', '-e', script], IN_TEST_STACK);
    const [base, status, ...body] = result.stdout.split('\n');
    const config = await composeConfig(TEST_STACK_ENV);

    expect(result.code).toBe(0);
    expect(base).toBe('http://monobank-mock:8081');
    expect(status).toBe('200');
    expect(JSON.parse(body.join('\n'))).toEqual(defaultFixture);
    expect(config.services.app?.depends_on?.['monobank-mock']?.condition).toBe('service_healthy');
  });

  it('sends no upstream request while the app boots to a healthy /health', async () => {
    expect((await compose(['stop', 'app'], IN_TEST_STACK)).code).toBe(0);
    await reset();
    expect((await state()).requests).toBe(0);

    expect((await compose(['start', 'app'], IN_TEST_STACK)).code).toBe(0);
    const healthy = await pollUntil(
      async () => ((await tryGet(BASE_URL, '/health', 5000))?.status === 200 ? true : undefined),
      90_000,
    );
    await delay(5000);

    expect(healthy).toBe(true);
    expect((await state()).requests).toBe(0);
  }, 150_000);

  it('comes back with mode ok, the default fixture and a zero counter after the mock container restarts', async () => {
    await setMode('http500');
    await setFixture(F_EXAMPLE);
    await getCurrency();
    await getCurrency();
    expect(await state()).toEqual({ mode: 'http500', requests: 2, fixtureItems: 2 });

    expect((await compose(['restart', 'monobank-mock'], IN_TEST_STACK)).code).toBe(0);
    await expectHealthy(['monobank-mock'], 60_000, IN_TEST_STACK);
    const restarted = await state();
    const served = await getCurrency();

    expect(restarted).toEqual({
      mode: 'ok',
      requests: 0,
      fixtureItems: (defaultFixture as unknown[]).length,
    });
    expect(served.status).toBe(200);
    expect(JSON.parse(served.text)).toEqual(defaultFixture);
  }, 120_000);

  it('defines monobank-mock only in the test stack, which points the app at it and sets no rate TTLs', async () => {
    const base = await services(BASE_STACK_ENV);
    const test = await services(TEST_STACK_ENV);
    const baseConfig = await composeConfig(BASE_STACK_ENV);
    const testConfig = await composeConfig(TEST_STACK_ENV);

    expect(base).toEqual(['app', 'redis']);
    expect(test).toContain('monobank-mock');
    expect(testConfig.services.app?.environment?.MONOBANK_BASE_URL).toBe(
      'http://monobank-mock:8081',
    );
    expect(JSON.stringify(baseConfig)).not.toMatch(/RATES_\w*TTL_SECONDS/);
    expect(JSON.stringify(testConfig)).not.toMatch(/RATES_\w*TTL_SECONDS/);
  });

  it('documents the Monobank variables in the README and .env.example', async () => {
    const readme = await readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
    const envExample = await readFile(path.join(REPO_ROOT, '.env.example'), 'utf8');
    const baseUrlRow = tableRow(readme, 'MONOBANK_BASE_URL') ?? '';
    const timeoutRow = tableRow(readme, 'MONOBANK_TIMEOUT_MS') ?? '';
    const mockPortRow = tableRow(readme, 'MONOBANK_MOCK_HOST_PORT') ?? '';
    const testing = /^## Testing\n([\s\S]*?)(?=^## )/m.exec(readme)?.[1] ?? '';

    expect(baseUrlRow).toContain('`https://api.monobank.ua`');
    expect(baseUrlRow).toMatch(/http:\/\//);
    expect(baseUrlRow).toMatch(/https:\/\//);
    expect(timeoutRow).toContain('`3000`');
    expect(timeoutRow).toMatch(/(?<!\d)100(?!\d)/);
    expect(mockPortRow).toContain('`8081`');
    expect(testing).toMatch(/mock of the Monobank API/i);
    expect(envExample).toMatch(/^MONOBANK_BASE_URL=https:\/\/api\.monobank\.ua$/m);
    expect(envExample).toMatch(/^MONOBANK_TIMEOUT_MS=3000$/m);
    expect(envExample).toMatch(/^MONOBANK_MOCK_HOST_PORT=8081$/m);
  });
});
