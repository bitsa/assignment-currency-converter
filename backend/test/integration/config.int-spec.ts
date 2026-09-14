import { randomUUID } from 'node:crypto';
import { removeQaContainers, requireUrl, runApp, type AppContainer } from './helpers/app-container';
import { get, tryGet } from './helpers/http';
import { isJsonObjectLine, jsonLines, levelOf, nonEmptyLines, stripAnsi } from './helpers/logs';
import { delay, pollUntil } from './helpers/wait';

// Precondition: the main stack is up (its image and network are reused).
const BASELINE = { NODE_ENV: 'production', REDIS_URL: 'redis://redis:6379' };

const REJECTED: readonly (readonly [string, string])[] = [
  ['PORT', '0'],
  ['PORT', '65536'],
  ['PORT', '-1'],
  ['PORT', '3000.5'],
  ['PORT', 'abc'],
  ['NODE_ENV', 'staging'],
  ['NODE_ENV', 'Production'],
  ['LOG_LEVEL', 'verbose'],
  ['LOG_LEVEL', 'INFO'],
  ['REDIS_URL', 'not-a-url'],
  ['REDIS_URL', 'http://redis:6379'],
];

const ACCEPTED_RUNS: readonly Readonly<
  Record<'PORT' | 'NODE_ENV' | 'LOG_LEVEL' | 'REDIS_URL', string>
>[] = [
  { PORT: '1', NODE_ENV: 'development', LOG_LEVEL: 'fatal', REDIS_URL: 'redis://redis:6379' },
  { PORT: '3000', NODE_ENV: 'test', LOG_LEVEL: 'error', REDIS_URL: 'rediss://redis:6379' },
  { PORT: '65535', NODE_ENV: 'production', LOG_LEVEL: 'warn', REDIS_URL: 'redis://redis:6379' },
  { PORT: '3000', NODE_ENV: 'development', LOG_LEVEL: 'info', REDIS_URL: 'redis://redis:6379' },
  { PORT: '3000', NODE_ENV: 'test', LOG_LEVEL: 'debug', REDIS_URL: 'redis://redis:6379' },
  { PORT: '3000', NODE_ENV: 'production', LOG_LEVEL: 'trace', REDIS_URL: 'redis://redis:6379' },
  { PORT: '3000', NODE_ENV: 'production', LOG_LEVEL: 'silent', REDIS_URL: 'redis://redis:6379' },
];

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

function failures(results: readonly (string | undefined)[]): string[] {
  return results.filter((result): result is string => result !== undefined);
}

describe('configuration validation', () => {
  afterEach(removeQaContainers, 60_000);

  it('uses port 3000, development logging, info level and redis://redis:6379 when no variable is set', async () => {
    const app = await runApp();
    expect(await app.waitForHttp(30_000)).toBe('http');
    const url = requireUrl(app);

    expect(await waitForHealthy(url)).toBe(200);
    const uuid = randomUUID();
    expect((await get(url, `/api/docs-json?qa=${uuid}`)).status).toBe(200);
    await app.waitForLogs((logs) => logs.stdout.includes(uuid), 10_000);
    await app.stop();

    const lines = nonEmptyLines(stripAnsi((await app.logs()).stdout));
    expect(lines.some((line) => line.includes(uuid))).toBe(true);
    expect(lines.filter(isJsonObjectLine)).toEqual([]);
  }, 90_000);

  it('accepts HTTP on a non-default PORT and logs one info line with that port when ready', async () => {
    const app = await runApp({ env: { PORT: '4000', NODE_ENV: 'test' }, port: 4000 });
    expect(await app.waitForHttp(30_000)).toBe('http');
    const url = requireUrl(app);

    expect(await waitForHealthy(url)).toBe(200);
    await delay(1000);
    await app.stop();

    const ready = jsonLines((await app.logs()).stdout).filter((line) => {
      if (levelOf(line) !== 'info') {
        return false;
      }
      const rest: Record<string, unknown> = { ...line };
      delete rest.time;
      delete rest.pid;
      delete rest.hostname;
      return /(?<!\d)4000(?!\d)/.test(JSON.stringify(rest));
    });
    expect(ready).toHaveLength(1);
  }, 90_000);

  it('exits non-zero before serving HTTP and names the variable for each rejected value', async () => {
    const results = await Promise.all(
      REJECTED.map(([name, value]) => rejectionFailure({ ...BASELINE, [name]: value }, [name])),
    );

    expect(failures(results)).toEqual([]);
  }, 120_000);

  it('exits non-zero and names the variable when a variable is set to the empty string', async () => {
    const results = await Promise.all(
      ['PORT', 'NODE_ENV', 'LOG_LEVEL', 'REDIS_URL'].map((name) =>
        rejectionFailure({ ...BASELINE, [name]: '' }, [name]),
      ),
    );

    expect(failures(results)).toEqual([]);
  }, 120_000);

  it('names every invalid variable when several are invalid at once', async () => {
    const result = await rejectionFailure(
      { PORT: 'abc', NODE_ENV: 'staging', LOG_LEVEL: 'verbose', REDIS_URL: 'not-a-url' },
      ['PORT', 'NODE_ENV', 'LOG_LEVEL', 'REDIS_URL'],
    );

    expect(result).toBeUndefined();
  }, 60_000);

  it('starts without a configuration error for every accepted value', async () => {
    const results = await Promise.all(
      ACCEPTED_RUNS.map(async (env) => {
        const port = Number(env.PORT);
        const app = await runApp({
          env,
          port,
          ...(port === 1 ? { sysctl: { 'net.ipv4.ip_unprivileged_port_start': '0' } } : {}),
        });
        const outcome = await app.waitForHttp(30_000);
        return outcome === 'http'
          ? undefined
          : `${JSON.stringify(env)}: ${outcome}\n${(await output(app)).slice(0, 800)}`;
      }),
    );

    expect(failures(results)).toEqual([]);
  }, 120_000);

  it('ignores variables the configuration does not define', async () => {
    const app = await runApp({ env: { NODE_ENV: 'production', FOO: 'bar' } });
    expect(await app.waitForHttp(30_000)).toBe('http');

    expect(await waitForHealthy(requireUrl(app))).toBe(200);
  }, 60_000);

  it('exits non-zero and reports the address in use with the port when PORT is already bound', async () => {
    const first = await runApp({ env: { PORT: '4567', NODE_ENV: 'production' }, port: 4567 });
    expect(await first.waitForHttp(30_000)).toBe('http');

    const second = await runApp({
      env: { PORT: '4567', NODE_ENV: 'production' },
      network: `container:${first.name}`,
    });
    const code = await second.waitForExit(20_000);

    expect(code).toBeDefined();
    expect(code).not.toBe(0);
    const matching = nonEmptyLines(stripAnsi(await output(second))).filter(
      (line) => /address (already )?in use/i.test(line) && /(?<!\d)4567(?!\d)/.test(line),
    );
    expect(matching.length).toBeGreaterThan(0);
  }, 90_000);
});
