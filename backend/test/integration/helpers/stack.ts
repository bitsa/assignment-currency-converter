import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT, run, type RunOptions, type RunResult } from './run';
import { pollUntil } from './wait';

export function compose(args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
  return run('docker', ['compose', ...args], options);
}

interface PsEntry {
  readonly Service?: string;
  readonly State?: string;
  readonly Health?: string;
}

async function serviceStates(options: RunOptions): Promise<Map<string, PsEntry>> {
  const result = await compose(['ps', '-a', '--format', 'json'], options);
  const text = result.stdout.trim();
  const entries: PsEntry[] = [];
  if (text.startsWith('[')) {
    entries.push(...(JSON.parse(text) as PsEntry[]));
  } else {
    for (const line of text.split('\n')) {
      if (line.trim() !== '') {
        entries.push(JSON.parse(line) as PsEntry);
      }
    }
  }
  return new Map(entries.map((entry) => [entry.Service ?? '', entry]));
}

/** Waits until every service reports `healthy`; throws with `ps` and recent logs otherwise. */
export async function expectHealthy(
  services: readonly string[],
  timeoutMs: number,
  options: RunOptions = {},
): Promise<void> {
  const healthy = await pollUntil(
    async () => {
      const states = await serviceStates(options);
      return services.every((service) => states.get(service)?.Health === 'healthy')
        ? true
        : undefined;
    },
    Math.max(0, timeoutMs),
  );
  if (healthy === true) {
    return;
  }
  const ps = await compose(['ps', '-a'], options);
  const logs = await compose(['logs', '--no-color', '--tail', '50'], options);
  throw new Error(
    `${services.join(', ')} not healthy within ${timeoutMs} ms\n${ps.stdout}\n${logs.stdout}${logs.stderr}`,
  );
}

export interface ContainerInfo {
  readonly id: string;
  readonly startedAt: string;
  readonly restartCount: number;
}

export async function containerInfo(
  service: string,
  options: RunOptions = {},
): Promise<ContainerInfo> {
  const ids = await compose(['ps', '-q', service], options);
  const id = ids.stdout.trim();
  if (id === '') {
    throw new Error(`no running container for service ${service}`);
  }
  const inspect = await run('docker', [
    'inspect',
    '-f',
    '{{.Id}} {{.State.StartedAt}} {{.RestartCount}}',
    id,
  ]);
  const [fullId = '', startedAt = '', restarts = ''] = inspect.stdout.trim().split(' ');
  return { id: fullId, startedAt, restartCount: Number(restarts) };
}

/** Sends a raw `PING` over TCP and returns the first reply line (`+PONG` when healthy). */
export function redisPing(port: number, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let reply = '';
    const finish = (value: string): void => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(`timeout after "${reply}"`));
    socket.on('connect', () => socket.write('PING\r\n'));
    socket.on('data', (chunk: Buffer) => {
      reply += chunk.toString('utf8');
      if (reply.includes('\r\n')) {
        finish(reply.trim());
      }
    });
    socket.on('error', (error) => finish(`error: ${error.message}`));
  });
}

export function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

/**
 * Copies the files git would put in a clone (tracked plus untracked-but-not-ignored) into a
 * temporary directory: no `.env`, `node_modules` or build output.
 */
export async function cleanCopy(): Promise<string> {
  const listing = await run('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  if (listing.code !== 0) {
    throw new Error(`git ls-files failed: ${listing.stderr}`);
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'qa-clean-copy-'));
  for (const file of listing.stdout.split('\0').filter((entry) => entry !== '')) {
    const source = path.join(REPO_ROOT, file);
    if (!existsSync(source)) {
      continue;
    }
    const target = path.join(dir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  return dir;
}
