import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { nonEmptyLines, stripAnsi } from './helpers/logs';
import { REPO_ROOT, run, spawnLong } from './helpers/run';
import { pollUntil } from './helpers/wait';

// Precondition: the main stack is up and healthy.
const REQUIRED_TARGETS = [
  'up',
  'up-d',
  'down',
  'logs',
  'ps',
  'health',
  'test',
  'lint',
  'help',
  'docs-lint',
  'docs-fix',
];

describe('repository tooling', () => {
  it.each([['lint'], ['format:check'], ['typecheck'], ['test']])(
    'npm run %s exits 0 at the repository root',
    async (script) => {
      const result = await run('npm', ['run', script], { timeoutMs: 400_000 });

      expect(result).toMatchObject({ code: 0 });
    },
    420_000,
  );

  it('make ps, health, test and lint perform their actions', async () => {
    const ps = await run('make', ['ps']);
    expect(ps.code).toBe(0);
    expect(ps.stdout).toContain('app');
    expect(ps.stdout).toContain('redis');
    expect(ps.stdout).toContain('healthy');

    const health = await run('make', ['health']);
    expect(health.code).toBe(0);
    expect(health.stdout).toMatch(/"status"\s*:\s*"ok"/);

    expect(await run('make', ['test'], { timeoutMs: 300_000 })).toMatchObject({ code: 0 });
    expect(await run('make', ['lint'], { timeoutMs: 300_000 })).toMatchObject({ code: 0 });
  }, 650_000);

  it('make logs follows the logs of both services', async () => {
    const proc = spawnLong('make', ['logs']);
    try {
      const seen = await pollUntil(
        () => {
          const out = stripAnsi(proc.output());
          return /^\S*app\S*\s+\|/m.test(out) && /^\S*redis\S*\s+\|/m.test(out) ? true : undefined;
        },
        15_000,
        250,
      );

      expect(seen).toBe(true);
      expect(proc.isRunning()).toBe(true);
    } finally {
      proc.signal('SIGTERM');
      await pollUntil(() => (proc.isRunning() ? undefined : true), 10_000, 250);
      proc.signal('SIGKILL');
    }
  }, 60_000);

  it('make help lists every Makefile target with a description', async () => {
    const result = await run('make', ['help']);
    const makefile = await readFile(path.join(REPO_ROOT, 'Makefile'), 'utf8');
    const targets = [...makefile.matchAll(/^([A-Za-z0-9_-]+):/gm)].map((match) => match[1] ?? '');

    expect(result.code).toBe(0);
    expect(targets).toEqual(expect.arrayContaining(REQUIRED_TARGETS));
    const lines = nonEmptyLines(result.stdout);
    const missing = targets.filter(
      (target) => !lines.some((line) => new RegExp(`^\\s*${target}\\s+\\S`).test(line)),
    );
    expect(missing).toEqual([]);
  });

  it('.env.example lists every variable with the value the stack uses without .env', async () => {
    const text = await readFile(path.join(REPO_ROOT, '.env.example'), 'utf8');
    const values: Record<string, string> = {};
    for (const line of nonEmptyLines(text)) {
      const match = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
      if (match?.[1] !== undefined) {
        values[match[1]] = (match[2] ?? '').trim();
      }
    }

    expect(values).toMatchObject({
      PORT: '3000',
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      REDIS_URL: 'redis://redis:6379',
      APP_HOST_PORT: '3000',
      REDIS_HOST_PORT: '6390',
    });
  });
});
