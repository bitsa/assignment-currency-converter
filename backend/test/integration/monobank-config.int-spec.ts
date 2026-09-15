import { removeQaContainers, requireUrl, runApp, type AppContainer } from './helpers/app-container';
import { tryGet } from './helpers/http';
import { BASE_STACK_ENV } from './helpers/mock';
import { compose } from './helpers/stack';
import { delay, pollUntil } from './helpers/wait';

// Precondition: the test stack is up (its image and network are reused).
const BASELINE = { NODE_ENV: 'production', REDIS_URL: 'redis://redis:6379' };

function wholeWord(name: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);
}

async function output(app: AppContainer): Promise<string> {
  const logs = await app.logs();
  return `${logs.stdout}\n${logs.stderr}`;
}

async function waitForHealthy(url: string): Promise<number | undefined> {
  const response = await pollUntil(async () => {
    const current = await tryGet(url, '/health', 5000);
    return current?.status === 200 ? current : undefined;
  }, 15_000);
  return response?.status;
}

/** Returns a failure description, or `undefined` when the run was rejected as required. */
async function rejectionFailure(
  env: Readonly<Record<string, string>>,
  names: readonly string[],
): Promise<string | undefined> {
  const app = await runApp({ env });
  const outcome = await app.waitForHttp(20_000);
  const code = await app.exitCode();
  const text = await output(app);
  const missing = names.filter((name) => !wholeWord(name).test(text));
  if (outcome === 'exited' && code !== 0 && missing.length === 0) {
    return undefined;
  }
  return `${JSON.stringify(env)}: outcome=${outcome} exit=${code} missing=[${missing.join(', ')}]\n${text.slice(0, 800)}`;
}

/** Returns a failure description, or `undefined` when the run started and became healthy. */
async function startFailure(env: Readonly<Record<string, string>>): Promise<string | undefined> {
  const app = await runApp({ env });
  const outcome = await app.waitForHttp(30_000);
  if (outcome !== 'http') {
    return `${JSON.stringify(env)}: outcome=${outcome}\n${(await output(app)).slice(0, 800)}`;
  }
  const status = await waitForHealthy(requireUrl(app));
  return status === 200 ? undefined : `${JSON.stringify(env)}: /health never answered 200`;
}

function failures(results: readonly (string | undefined)[]): string[] {
  return results.filter((result): result is string => result !== undefined);
}

describe('Monobank configuration at startup', () => {
  afterEach(removeQaContainers, 60_000);

  it('refuses to start and names MONOBANK_BASE_URL when it is empty, not a URL, or not http or https', async () => {
    const results = await Promise.all(
      ['', 'not-a-url', 'ftp://api.monobank.ua', 'redis://x'].map((value) =>
        rejectionFailure({ ...BASELINE, MONOBANK_BASE_URL: value }, ['MONOBANK_BASE_URL']),
      ),
    );

    expect(failures(results)).toEqual([]);
  }, 120_000);

  it('refuses to start and names MONOBANK_TIMEOUT_MS when it is empty, not an integer, or below 100', async () => {
    const results = await Promise.all(
      ['', 'abc', '99', '1500.5', '-1', '0'].map((value) =>
        rejectionFailure({ ...BASELINE, MONOBANK_TIMEOUT_MS: value }, ['MONOBANK_TIMEOUT_MS']),
      ),
    );

    expect(failures(results)).toEqual([]);
  }, 120_000);

  it('names every invalid variable together when both Monobank variables are invalid', async () => {
    const both = { ...BASELINE, MONOBANK_BASE_URL: 'not-a-url', MONOBANK_TIMEOUT_MS: 'abc' };
    const results = await Promise.all([
      rejectionFailure(both, ['MONOBANK_BASE_URL', 'MONOBANK_TIMEOUT_MS']),
      rejectionFailure({ ...both, PORT: 'abc' }, [
        'MONOBANK_BASE_URL',
        'MONOBANK_TIMEOUT_MS',
        'PORT',
      ]),
    ]);

    expect(failures(results)).toEqual([]);
  }, 120_000);

  it('starts healthy with MONOBANK_TIMEOUT_MS at the minimum 100 and with other accepted values', async () => {
    const results = await Promise.all(
      [
        { MONOBANK_TIMEOUT_MS: '100' },
        { MONOBANK_BASE_URL: 'http://monobank-mock:8081/' },
        { MONOBANK_BASE_URL: 'https://api.monobank.ua' },
        { MONOBANK_TIMEOUT_MS: '3000' },
        { MONOBANK_TIMEOUT_MS: '60000' },
      ].map((extra) => startFailure({ ...BASELINE, ...extra })),
    );

    expect(failures(results)).toEqual([]);
  }, 150_000);

  it('starts healthy with no Monobank variable set', async () => {
    expect(await startFailure({ NODE_ENV: 'production' })).toBeUndefined();
  }, 90_000);

  it('leaves both Monobank variables undefined for the app in the base stack, so the defaults apply', async () => {
    const result = await compose(['config', '--format', 'json'], { env: BASE_STACK_ENV });
    expect(result.code).toBe(0);
    const config = JSON.parse(result.stdout) as {
      services: Record<string, { environment?: Record<string, unknown> }>;
    };
    const environment = config.services.app?.environment ?? {};

    expect(Object.keys(environment)).not.toContain('MONOBANK_BASE_URL');
    expect(Object.keys(environment)).not.toContain('MONOBANK_TIMEOUT_MS');
  });

  it('never prints the password of a MONOBANK_BASE_URL with credentials at startup, even at trace level', async () => {
    const app = await runApp({
      env: {
        ...BASELINE,
        MONOBANK_BASE_URL: 'https://user:qa-secret-7f3a@api.monobank.ua',
        LOG_LEVEL: 'trace',
      },
    });
    expect(await app.waitForHttp(30_000)).toBe('http');
    expect(await waitForHealthy(requireUrl(app))).toBe(200);
    await delay(2000);
    await app.stop();

    expect(await output(app)).not.toContain('qa-secret-7f3a');
  }, 90_000);
});
