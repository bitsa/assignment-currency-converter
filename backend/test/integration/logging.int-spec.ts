import { randomUUID } from 'node:crypto';
import {
  removeQaContainers,
  removeQaNetwork,
  requireUrl,
  runApp,
  type AppContainer,
} from './helpers/app-container';
import { get, tryGet } from './helpers/http';
import {
  completion,
  ESC,
  isJsonObjectLine,
  jsonLines,
  levelOf,
  LOWER_CASE_LEVELS,
  mentions,
  nonEmptyLines,
  stripAnsi,
} from './helpers/logs';
import { delay, pollUntil } from './helpers/wait';

// Precondition: the main stack is up (its image and network are reused).
const SECRET = 's3cret-pw';

async function started(app: AppContainer): Promise<string> {
  expect(await app.waitForHttp(30_000)).toBe('http');
  return requireUrl(app);
}

async function untilHealthy(url: string): Promise<void> {
  const healthy = await pollUntil(
    async () => ((await tryGet(url, '/health', 5000))?.status === 200 ? true : undefined),
    15_000,
  );
  expect(healthy).toBe(true);
}

describe('request logging', () => {
  afterEach(removeQaContainers, 60_000);

  afterAll(removeQaNetwork, 60_000);

  it('writes JSON lines with lower-case levels and no colour codes in test and production', async () => {
    for (const nodeEnv of ['test', 'production']) {
      const app = await runApp({ env: { NODE_ENV: nodeEnv, LOG_LEVEL: 'trace' } });
      const url = await started(app);
      const uuid = randomUUID();

      await get(url, '/api/docs-json');
      await get(url, `/api/qa-${uuid}`);
      await get(url, '/health');
      await app.waitForLogs((logs) => logs.stdout.includes(uuid), 10_000);
      await delay(1000);
      await app.stop();

      const { stdout } = await app.logs();
      expect(stdout.trim()).not.toBe('');
      expect(stdout.includes(ESC)).toBe(false);
      const lines = jsonLines(stdout);
      expect(lines.filter((line) => !LOWER_CASE_LEVELS.includes(levelOf(line) ?? ''))).toEqual([]);
    }
  }, 120_000);

  it('writes human-readable, non-JSON output in development', async () => {
    const app = await runApp({ env: { NODE_ENV: 'development' } });
    const url = await started(app);
    const uuid = randomUUID();

    await get(url, `/api/qa-${uuid}`);
    await app.waitForLogs((logs) => logs.stdout.includes(uuid), 10_000);
    await app.stop();

    const lines = nonEmptyLines(stripAnsi((await app.logs()).stdout));
    expect(lines.some((line) => line.includes(uuid))).toBe(true);
    expect(lines.filter(isJsonObjectLine)).toEqual([]);
  }, 90_000);

  it('writes one completion line per request at the level of its status class, with distinct reqIds', async () => {
    const env = { NODE_ENV: 'test', LOG_LEVEL: 'info' };
    const withRedis = await runApp({ env });
    const withoutRedis = await runApp({ env, network: 'none-redis' });
    const url = await started(withRedis);
    const noRedisUrl = await started(withoutRedis);
    const [u1, u2, u3, u4] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

    expect((await get(url, `/api/docs-json?qa=${u1}`)).status).toBe(200);
    expect((await get(url, `/api/qa-${u2}`)).status).toBe(404);
    expect((await get(url, `/api/qa-${u3}`)).status).toBe(404);
    expect((await get(noRedisUrl, `/health?qa=${u4}`)).status).toBe(503);
    await withRedis.waitForLogs((logs) => logs.stdout.includes(u3), 10_000);
    await withoutRedis.waitForLogs((logs) => logs.stdout.includes(u4), 10_000);
    await delay(500);
    await Promise.all([withRedis.stop(), withoutRedis.stop()]);

    const lines = jsonLines((await withRedis.logs()).stdout);
    const noRedisLines = jsonLines((await withoutRedis.logs()).stdout);
    const found = [
      completion(lines, { uuid: u1, method: 'GET', status: 200 }),
      completion(lines, { uuid: u2, method: 'GET', status: 404 }),
      completion(lines, { uuid: u3, method: 'GET', status: 404 }),
      completion(noRedisLines, { uuid: u4, method: 'GET', status: 503 }),
    ];
    expect(found.map((matches) => matches.length)).toEqual([1, 1, 1, 1]);
    expect(found.map((matches) => matches[0] && levelOf(matches[0]))).toEqual([
      'info',
      'warn',
      'warn',
      'error',
    ]);
    expect(found[1]?.[0]?.reqId).not.toEqual(found[2]?.[0]?.reqId);
  }, 120_000);

  it('writes no log line for /health requests that answer 200', async () => {
    const app = await runApp({ env: { NODE_ENV: 'test', LOG_LEVEL: 'trace' } });
    const url = await started(app);
    await untilHealthy(url);
    await delay(1000);
    const before = nonEmptyLines((await app.logs()).stdout).length;

    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await get(url, '/health')).status).toBe(200);
    }
    await delay(1000);

    expect(nonEmptyLines((await app.logs()).stdout).slice(before)).toEqual([]);
  }, 90_000);

  it("puts the request's reqId on every line written while handling it", async () => {
    const app = await runApp({ env: { NODE_ENV: 'test', LOG_LEVEL: 'trace' } });
    const url = await started(app);
    await untilHealthy(url);
    await delay(1000);

    for (const makePath of [
      (uuid: string): string => `/api/qa-${uuid}`,
      (uuid: string): string => `/api/docs-json?qa=${uuid}`,
    ]) {
      const uuid = randomUUID();
      const before = nonEmptyLines((await app.logs()).stdout).length;

      const response = await get(url, makePath(uuid));
      await delay(1000);

      const added = jsonLines((await app.logs()).stdout).slice(before);
      const [done] = completion(added, { uuid, method: 'GET', status: response.status });
      expect(done).toBeDefined();
      expect(added.filter((line) => line.reqId !== done?.reqId)).toEqual([]);
    }
  }, 90_000);

  it('writes no info-or-lower line for GET /api/docs at LOG_LEVEL warn', async () => {
    const app = await runApp({ env: { NODE_ENV: 'test', LOG_LEVEL: 'warn' } });
    const url = await started(app);
    const uuid = randomUUID();

    expect((await get(url, '/api/docs')).status).toBe(200);
    await get(url, `/api/qa-${uuid}`);
    await app.waitForLogs((logs) => logs.stdout.includes(uuid), 10_000);
    await delay(500);
    await app.stop();

    const lines = jsonLines((await app.logs()).stdout);
    expect(
      lines.filter((line) => ['info', 'debug', 'trace'].includes(levelOf(line) ?? '')),
    ).toEqual([]);
    expect(lines.filter((line) => levelOf(line) === 'warn' && mentions(line, uuid))).toHaveLength(
      1,
    );
  }, 90_000);

  it('never writes the Redis password to the logs or the /health body', async () => {
    const results = await Promise.all(
      [`redis://:${SECRET}@redis:6379`, `redis://:${SECRET}@qa-no-such-host:6379`].map(
        async (redisUrl) => {
          const app = await runApp({
            env: { NODE_ENV: 'production', LOG_LEVEL: 'trace', REDIS_URL: redisUrl },
          });
          const url = await started(app);

          const health = await get(url, '/health', 10_000);
          await get(url, `/api/qa-${randomUUID()}`);
          await delay(5000);
          await app.stop();
          const logs = await app.logs();

          return {
            redisUrl,
            healthBody: health.text.includes(SECRET),
            stdout: logs.stdout.includes(SECRET),
            stderr: logs.stderr.includes(SECRET),
          };
        },
      ),
    );

    expect(results).toEqual(
      results.map(({ redisUrl }) => ({
        redisUrl,
        healthBody: false,
        stdout: false,
        stderr: false,
      })),
    );
  }, 90_000);

  it('writes nothing at LOG_LEVEL silent', async () => {
    const app = await runApp({ env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' } });
    const url = await started(app);

    await get(url, '/api/docs-json');
    await get(url, `/api/qa-${randomUUID()}`);
    await get(url, '/health');
    await delay(1000);
    await app.stop();

    expect(await app.logs()).toEqual({ stdout: '', stderr: '' });
  }, 90_000);
});
