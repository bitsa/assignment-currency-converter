import { spawn } from 'node:child_process';
import path from 'node:path';

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface LongProcess {
  output(): string;
  isRunning(): boolean;
  signal(signal: NodeJS.Signals): void;
}

// Variables that would leak the test runner's own context into the commands under test:
// npm's per-script config (for example the `-w backend` of the integration script), the
// application's variables and the Compose variables.
const NOT_INHERITED =
  /^(npm_.*|INIT_CWD|PORT|NODE_ENV|LOG_LEVEL|REDIS_URL|APP_HOST_PORT|REDIS_HOST_PORT|COMPOSE_.*)$/i;

export function childEnv(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !NOT_INHERITED.test(key)) {
      env[key] = value;
    }
  }
  return { ...env, ...extra };
}

export function run(
  cmd: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: childEnv(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => child.kill('SIGKILL'), options.timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Starts a command that does not exit by itself, in its own process group. */
export function spawnLong(
  cmd: string,
  args: readonly string[],
  options: RunOptions = {},
): LongProcess {
  const child = spawn(cmd, args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: childEnv(options.env),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  let running = true;
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    output += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    output += chunk;
  });
  child.on('close', () => {
    running = false;
  });
  child.on('error', () => {
    running = false;
  });

  return {
    output: () => output,
    isRunning: () => running,
    signal: (signal) => {
      if (!running || child.pid === undefined) {
        return;
      }
      try {
        // Negative pid: the whole group, as a terminal delivers Ctrl+C.
        process.kill(-child.pid, signal);
      } catch {
        // The group has already exited.
      }
    },
  };
}
