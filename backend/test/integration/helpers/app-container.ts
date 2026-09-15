import { randomUUID } from 'node:crypto';
import { tryGet } from './http';
import { run, type RunOptions } from './run';
import { containerInfo } from './stack';
import { pollUntil } from './wait';

const PREFIX = 'qa-int-';
const NONE_REDIS_NETWORK = 'qa-int-none-redis';
const APP_VARIABLES = [
  'PORT',
  'NODE_ENV',
  'LOG_LEVEL',
  'REDIS_URL',
  'MONOBANK_BASE_URL',
  'MONOBANK_TIMEOUT_MS',
  'RATES_CACHE_TTL_SECONDS',
] as const;

/** `stack`: the main stack's network (where `redis` resolves); `none-redis`: a bridge without Redis. */
export type AppNetwork = 'stack' | 'none-redis' | `container:${string}`;

export interface RunAppOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly network?: AppNetwork;
  /** Container port to publish on a random host port (default `3000`). */
  readonly port?: number;
  readonly restart?: 'no' | 'on-failure';
  readonly sysctl?: Readonly<Record<string, string>>;
}

export interface AppLogs {
  readonly stdout: string;
  readonly stderr: string;
}

export interface AppContainer {
  readonly name: string;
  readonly url: string | undefined;
  /** Resolves `"http"` once any HTTP response arrives, `"exited"` if the container stops first. */
  waitForHttp(timeoutMs: number): Promise<'http' | 'exited' | 'timeout'>;
  /** Resolves the exit code, or `undefined` if the container is still running at the deadline. */
  waitForExit(timeoutMs: number): Promise<number | undefined>;
  waitForLogs(predicate: (logs: AppLogs) => boolean, timeoutMs: number): Promise<boolean>;
  logs(): Promise<AppLogs>;
  exitCode(): Promise<number>;
  restartCount(): Promise<number>;
  stop(): Promise<void>;
}

interface StackTarget {
  readonly image: string;
  readonly network: string;
  readonly command: readonly string[];
}

interface ContainerInspect {
  readonly Image: string;
  readonly NetworkSettings: { readonly Networks: Readonly<Record<string, unknown>> };
}

interface ImageInspect {
  readonly Config: { readonly Entrypoint: string[] | null; readonly Cmd: string[] | null };
}

let target: Promise<StackTarget> | undefined;

async function loadTarget(): Promise<StackTarget> {
  const { id } = await containerInfo('app');
  const [container] = JSON.parse(
    (await run('docker', ['inspect', id])).stdout,
  ) as ContainerInspect[];
  if (container === undefined) {
    throw new Error('cannot inspect the main stack app container');
  }
  const [image] = JSON.parse(
    (await run('docker', ['image', 'inspect', container.Image])).stdout,
  ) as ImageInspect[];
  const [network] = Object.keys(container.NetworkSettings.Networks);
  if (image === undefined || network === undefined) {
    throw new Error('cannot resolve the main stack app image or network');
  }
  return {
    image: container.Image,
    network,
    command: [...(image.Config.Entrypoint ?? []), ...(image.Config.Cmd ?? [])],
  };
}

function stackTarget(): Promise<StackTarget> {
  target ??= loadTarget();
  return target;
}

async function ensureNoneRedisNetwork(): Promise<void> {
  const existing = await run('docker', ['network', 'inspect', NONE_REDIS_NETWORK]);
  if (existing.code !== 0) {
    await run('docker', ['network', 'create', NONE_REDIS_NETWORK]);
  }
}

async function state(
  name: string,
): Promise<{ status: string; exitCode: number; restarts: number }> {
  const result = await run('docker', [
    'inspect',
    '-f',
    '{{.State.Status}} {{.State.ExitCode}} {{.RestartCount}}',
    name,
  ]);
  const [status = 'unknown', exitCode = '0', restarts = '0'] = result.stdout.trim().split(' ');
  return { status, exitCode: Number(exitCode), restarts: Number(restarts) };
}

/**
 * Starts a throw-away container from the image the main stack's `app` runs. The
 * application variables are unset (so an image `ENV` cannot leak in) except those in `env`.
 */
export async function runApp(options: RunAppOptions = {}): Promise<AppContainer> {
  const { image, network: stackNetwork, command } = await stackTarget();
  const name = `${PREFIX}${randomUUID().slice(0, 8)}`;
  const port = options.port ?? 3000;
  const network = options.network ?? 'stack';
  const publishes = !network.startsWith('container:');

  const args = ['run', '-d', '--init', '--name', name];
  if (network === 'stack') {
    args.push('--network', stackNetwork);
  } else if (network === 'none-redis') {
    await ensureNoneRedisNetwork();
    args.push('--network', NONE_REDIS_NETWORK);
  } else {
    args.push('--network', network);
  }
  if (publishes) {
    args.push('-p', `127.0.0.1::${port}`);
  }
  if (options.restart !== undefined) {
    args.push('--restart', options.restart);
  }
  for (const [key, value] of Object.entries(options.sysctl ?? {})) {
    args.push('--sysctl', `${key}=${value}`);
  }
  args.push('--entrypoint', 'env', image);
  for (const variable of APP_VARIABLES) {
    args.push('-u', variable);
  }
  for (const [key, value] of Object.entries(options.env ?? {})) {
    args.push(`${key}=${value}`);
  }
  args.push(...command);

  const started = await run('docker', args);
  if (started.code !== 0) {
    throw new Error(`docker run failed: ${started.stderr}`);
  }

  let url: string | undefined;
  if (publishes) {
    const mapping = await run('docker', ['port', name, `${port}/tcp`]);
    const hostPort = mapping.stdout.trim().split('\n')[0]?.split(':').pop();
    url = hostPort ? `http://127.0.0.1:${hostPort}` : undefined;
  }

  const logs = async (options: RunOptions = {}): Promise<AppLogs> => {
    const result = await run('docker', ['logs', name], options);
    return { stdout: result.stdout, stderr: result.stderr };
  };

  return {
    name,
    url,
    waitForHttp: async (timeoutMs) => {
      const outcome = await pollUntil(
        async () => {
          const current = await state(name);
          if (current.status === 'exited' || current.status === 'dead') {
            return 'exited' as const;
          }
          if (url !== undefined && (await tryGet(url, '/health', 6000)) !== undefined) {
            return 'http' as const;
          }
          return undefined;
        },
        timeoutMs,
        500,
      );
      return outcome ?? 'timeout';
    },
    waitForExit: async (timeoutMs) =>
      pollUntil(
        async () => {
          const current = await state(name);
          return current.status === 'exited' || current.status === 'dead'
            ? current.exitCode
            : undefined;
        },
        timeoutMs,
        500,
      ),
    waitForLogs: async (predicate, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      // Each probe gets only the remaining budget, so a stalled `docker logs` cannot outlive it.
      const probe = async (): Promise<true | undefined> =>
        predicate(await logs({ timeoutMs: Math.max(deadline - Date.now(), 1) })) ? true : undefined;
      return (await pollUntil(probe, timeoutMs, 500)) === true;
    },
    logs: () => logs(),
    exitCode: async () => (await state(name)).exitCode,
    restartCount: async () => (await state(name)).restarts,
    stop: async () => {
      await run('docker', ['stop', '-t', '10', name]);
    },
  };
}

export function requireUrl(app: AppContainer): string {
  if (app.url === undefined) {
    throw new Error(`${app.name} publishes no port`);
  }
  return app.url;
}

export async function removeQaContainers(): Promise<void> {
  const ids = await run('docker', ['ps', '-aq', '--filter', `name=${PREFIX}`]);
  const list = ids.stdout.split('\n').filter((id) => id.trim() !== '');
  if (list.length > 0) {
    await run('docker', ['rm', '-f', ...list]);
  }
}

export async function removeQaNetwork(): Promise<void> {
  await removeQaContainers();
  await run('docker', ['network', 'rm', NONE_REDIS_NETWORK]);
}
