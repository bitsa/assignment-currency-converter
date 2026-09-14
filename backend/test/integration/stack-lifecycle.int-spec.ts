import { randomUUID } from 'node:crypto';
import { readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { get, tryGet } from './helpers/http';
import { jsonLines, levelOf, mentions } from './helpers/logs';
import { run, spawnLong, type RunOptions } from './helpers/run';
import {
  cleanCopy,
  compose,
  containerInfo,
  expectHealthy,
  isPortOpen,
  redisPing,
} from './helpers/stack';
import { pollUntil } from './helpers/wait';

// Precondition: the main stack is down. Cases run in order and share one clean copy.
const PROJECT = 'qa-lifecycle';

async function findLockfiles(root: string, relative = ''): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const entryPath = path.join(relative, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      found.push(...(await findLockfiles(root, entryPath)));
    } else if (entry.isFile() && entry.name === 'package-lock.json') {
      found.push(entryPath);
    }
  }
  return found;
}

describe('stack lifecycle from a clean clone', () => {
  let copy = '';
  const inCopy = (extra: Partial<RunOptions> = {}): RunOptions => ({
    cwd: copy,
    env: { COMPOSE_PROJECT_NAME: PROJECT },
    ...extra,
  });

  beforeAll(async () => {
    const busy: number[] = [];
    for (const port of [3000, 6390]) {
      if (await isPortOpen(port)) {
        busy.push(port);
      }
    }
    if (busy.length > 0) {
      throw new Error(`host port(s) ${busy.join(', ')} in use; run docker compose down first`);
    }
    copy = await cleanCopy();
  }, 120_000);

  afterAll(async () => {
    if (copy !== '') {
      await compose(['down', '--remove-orphans'], inCopy({ timeoutMs: 120_000 }));
      await rm(copy, { recursive: true, force: true });
    }
  }, 240_000);

  it('passes the backend unit tests with no Compose stack running', async () => {
    expect((await compose(['ps', '-q'])).stdout.trim()).toBe('');

    const result = await run('npm', ['test', '-w', 'backend'], { timeoutMs: 300_000 });

    expect(result).toMatchObject({ code: 0 });
  }, 320_000);

  it('reports app and redis healthy within 60 seconds of starting a clean clone without .env', async () => {
    expect(await compose(['build'], inCopy({ timeoutMs: 900_000 }))).toMatchObject({ code: 0 });

    const startedAt = Date.now();
    expect(await compose(['up', '-d'], inCopy())).toMatchObject({ code: 0 });

    await expectHealthy(['app', 'redis'], 60_000 - (Date.now() - startedAt), inCopy());
  }, 1_000_000);

  it('publishes the API on host port 3000 and Redis on host port 6390 by default', async () => {
    const port = await compose(['port', 'redis', '6379'], inCopy());

    expect(port.stdout.trim()).toMatch(/:6390$/);
    expect(await redisPing(6390)).toBe('+PONG');
    expect((await get('http://localhost:3000', '/health')).status).toBe(200);
  }, 60_000);

  it('make down removes the containers and the network', async () => {
    expect(await run('make', ['down'], inCopy({ timeoutMs: 120_000 }))).toMatchObject({ code: 0 });

    expect((await compose(['ps', '-a', '-q'], inCopy())).stdout.trim()).toBe('');
    const networks = await run('docker', ['network', 'ls', '-q', '--filter', `name=${PROJECT}_`]);
    expect(networks.stdout.trim()).toBe('');
  }, 150_000);

  it('make up-d starts a stack that becomes healthy within 60 seconds', async () => {
    try {
      expect(await run('make', ['up-d'], inCopy({ timeoutMs: 600_000 }))).toMatchObject({
        code: 0,
      });
      await expectHealthy(['app', 'redis'], 60_000, inCopy());
    } finally {
      await run('make', ['down'], inCopy({ timeoutMs: 120_000 }));
    }
  }, 800_000);

  it('make up serves /health in the foreground and exits after an interrupt', async () => {
    const proc = spawnLong('make', ['up'], inCopy());
    try {
      const answered = await pollUntil(async () => {
        if (!proc.isRunning()) {
          return false;
        }
        return (await tryGet('http://localhost:3000', '/health', 5000))?.status === 200
          ? true
          : undefined;
      }, 120_000);
      if (answered !== true || !proc.isRunning()) {
        throw new Error(`make up: no 200 while running\n${proc.output().slice(-4000)}`);
      }

      proc.signal('SIGINT');
      const exited = await pollUntil(() => (proc.isRunning() ? undefined : true), 30_000, 250);

      expect(exited).toBe(true);
    } finally {
      proc.signal('SIGKILL');
      await run('make', ['down'], inCopy({ timeoutMs: 120_000 }));
    }
  }, 300_000);

  it('applies APP_HOST_PORT, REDIS_HOST_PORT and LOG_LEVEL from a root .env file', async () => {
    const envFile = path.join(copy, '.env');
    await writeFile(envFile, 'APP_HOST_PORT=3100\nREDIS_HOST_PORT=6391\nLOG_LEVEL=warn\n');
    try {
      expect(await compose(['up', '-d'], inCopy({ timeoutMs: 600_000 }))).toMatchObject({
        code: 0,
      });
      await expectHealthy(['app', 'redis'], 60_000, inCopy());

      expect((await get('http://localhost:3100', '/health')).status).toBe(200);
      expect(await redisPing(6391)).toBe('+PONG');

      const uuid = randomUUID();
      await get('http://localhost:3100', '/api/docs');
      await get('http://localhost:3100', `/api/qa-${uuid}`);
      const { id } = await containerInfo('app', inCopy());
      const appLogs = async (): Promise<string> => (await run('docker', ['logs', id])).stdout;
      await pollUntil(async () => ((await appLogs()).includes(uuid) ? true : undefined), 10_000);

      const lines = jsonLines(await appLogs());
      expect(lines.filter((line) => levelOf(line) === 'warn' && mentions(line, uuid))).toHaveLength(
        1,
      );
      expect(
        lines.filter((line) => ['info', 'debug', 'trace'].includes(levelOf(line) ?? '')),
      ).toEqual([]);
    } finally {
      await compose(['down'], inCopy({ timeoutMs: 120_000 }));
      await rm(envFile, { force: true });
    }
  }, 900_000);

  it('npm ci installs every workspace from the single root lockfile', async () => {
    expect(await run('npm', ['ci'], { cwd: copy, timeoutMs: 600_000 })).toMatchObject({ code: 0 });
    expect(await run('npm', ['ls', '-w', 'backend', '--depth=0'], { cwd: copy })).toMatchObject({
      code: 0,
    });

    expect(await findLockfiles(copy)).toEqual(['package-lock.json']);
  }, 700_000);
});
