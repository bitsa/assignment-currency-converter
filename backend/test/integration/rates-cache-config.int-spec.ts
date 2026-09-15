import { removeQaContainers, requireUrl, runApp, type AppContainer } from './helpers/app-container';
import { tryGet } from './helpers/http';
import { delay, pollUntil } from './helpers/wait';

// Precondition: the test stack is up (its image and network are reused).
const BASELINE = {
  NODE_ENV: 'production',
  REDIS_URL: 'redis://redis:6379',
  MONOBANK_BASE_URL: 'http://monobank-mock:8081',
};

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

/** Returns a failure description, or `undefined` when the run started healthy with no TTL complaint. */
async function startFailure(env: Readonly<Record<string, string>>): Promise<string | undefined> {
  const app = await runApp({ env });
  const outcome = await app.waitForHttp(30_000);
  if (outcome !== 'http') {
    return `${JSON.stringify(env)}: outcome=${outcome}\n${(await output(app)).slice(0, 800)}`;
  }
  const status = await waitForHealthy(requireUrl(app));
  if (status !== 200) {
    return `${JSON.stringify(env)}: /health never answered 200`;
  }
  await delay(1000);
  const complaints = (await output(app))
    .split('\n')
    .filter((line) => wholeWord('RATES_CACHE_TTL_SECONDS').test(line))
    .filter((line) => /invalid|must|required|not allowed|error/i.test(line));
  return complaints.length === 0
    ? undefined
    : `${JSON.stringify(env)}: output names RATES_CACHE_TTL_SECONDS as invalid\n${complaints.join('\n')}`;
}

function failures(results: readonly (string | undefined)[]): string[] {
  return results.filter((result): result is string => result !== undefined);
}

describe('Rates cache configuration at startup', () => {
  afterEach(removeQaContainers, 60_000);

  it('refuses to start and names RATES_CACHE_TTL_SECONDS when it is zero, negative, empty, fractional or not a number', async () => {
    const results = await Promise.all(
      ['0', '-1', '', '1.5', 'abc'].map((value) =>
        rejectionFailure({ ...BASELINE, RATES_CACHE_TTL_SECONDS: value }, [
          'RATES_CACHE_TTL_SECONDS',
        ]),
      ),
    );

    expect(failures(results)).toEqual([]);
  }, 120_000);

  it('names RATES_CACHE_TTL_SECONDS together with another invalid variable in the startup error', async () => {
    const results = await Promise.all([
      rejectionFailure({ ...BASELINE, RATES_CACHE_TTL_SECONDS: '0', PORT: 'abc' }, [
        'RATES_CACHE_TTL_SECONDS',
        'PORT',
      ]),
      rejectionFailure({ ...BASELINE, RATES_CACHE_TTL_SECONDS: 'abc', MONOBANK_TIMEOUT_MS: '99' }, [
        'RATES_CACHE_TTL_SECONDS',
        'MONOBANK_TIMEOUT_MS',
      ]),
    ]);

    expect(failures(results)).toEqual([]);
  }, 120_000);

  it('starts healthy with RATES_CACHE_TTL_SECONDS at the minimum 1, at other accepted values and when unset', async () => {
    const results = await Promise.all(
      [
        { RATES_CACHE_TTL_SECONDS: '1' },
        { RATES_CACHE_TTL_SECONDS: '5' },
        { RATES_CACHE_TTL_SECONDS: '300' },
        { RATES_CACHE_TTL_SECONDS: '86400' },
        {},
      ].map((extra) => startFailure({ ...BASELINE, ...extra })),
    );

    expect(failures(results)).toEqual([]);
  }, 150_000);
});
