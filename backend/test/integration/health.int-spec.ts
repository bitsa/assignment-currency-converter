import { removeQaContainers, removeQaNetwork, requireUrl, runApp } from './helpers/app-container';
import { BASE_URL, get, tryGet } from './helpers/http';
import { run } from './helpers/run';
import { compose, containerInfo, expectHealthy, type ContainerInfo } from './helpers/stack';
import { delay, pollUntil } from './helpers/wait';

// Precondition: the main stack is up and healthy.
describe('/health on the running stack', () => {
  afterEach(removeQaContainers, 60_000);

  afterAll(async () => {
    await compose(['start', 'redis']);
    await expectHealthy(['app', 'redis'], 90_000);
    await removeQaNetwork();
  }, 150_000);

  it('answers 200 with status ok and redis up while Redis is reachable', async () => {
    const response = await get(BASE_URL, '/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toMatchObject({ status: 'ok', info: { redis: { status: 'up' } } });
  });

  it('runs the app container main process as a non-root user', async () => {
    const result = await compose(['exec', '-T', 'app', 'id', '-u']);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+$/);
    expect(result.stdout.trim()).not.toBe('0');
  });

  describe('when the redis service is stopped and started again', () => {
    let before: ContainerInfo | undefined;

    it('answers 503 with status error and redis down, each within 5 seconds', async () => {
      before = await containerInfo('app');
      expect(await compose(['stop', 'redis'])).toMatchObject({ code: 0 });

      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await get(BASE_URL, '/health', 5000);

        expect(response.elapsedMs).toBeLessThan(5000);
        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({
          status: 'error',
          error: { redis: { status: 'down' } },
        });
      }
    }, 60_000);

    it('make health exits non-zero while /health answers 503', async () => {
      const result = await run('make', ['health']);

      expect(result.code).not.toBe(0);
    }, 30_000);

    it('returns to 200 within 30 seconds of Redis becoming healthy without restarting the app', async () => {
      expect(await compose(['start', 'redis'])).toMatchObject({ code: 0 });
      await expectHealthy(['redis'], 60_000);

      const recovered = await pollUntil(
        async () => ((await tryGet(BASE_URL, '/health', 5000))?.status === 200 ? true : undefined),
        30_000,
      );

      expect(recovered).toBe(true);
      const after = await containerInfo('app');
      expect({ id: after.id, startedAt: after.startedAt }).toEqual({
        id: before?.id,
        startedAt: before?.startedAt,
      });
    }, 120_000);
  });

  it('keeps serving for 30 seconds without restarts and reports redis down when Redis is unreachable at boot', async () => {
    const app = await runApp({
      env: { NODE_ENV: 'production' },
      network: 'none-redis',
      restart: 'on-failure',
    });
    expect(await app.waitForHttp(30_000)).toBe('http');
    const url = requireUrl(app);

    const startedAt = Date.now();
    for (let tick = 0; tick <= 6; tick++) {
      await delay(Math.max(0, startedAt + tick * 5000 - Date.now()));

      expect((await get(url, '/api/docs-json')).status).toBe(200);
      const health = await get(url, '/health', 5000);
      expect(health.elapsedMs).toBeLessThan(5000);
      expect(health.status).toBe(503);
      expect(health.body).toMatchObject({ error: { redis: { status: 'down' } } });
    }

    expect(await app.restartCount()).toBe(0);
  }, 150_000);
});
