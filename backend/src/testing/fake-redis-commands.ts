import type { RatesRedisCommands } from '../rates/repository/redis-rates.repository';

export type FakeCommand = 'get' | 'set' | 'del';

const ALL_COMMANDS: readonly FakeCommand[] = ['get', 'set', 'del'];

type Entry =
  | {
      readonly type: 'string';
      readonly value: string;
      readonly seconds: number;
      readonly expiresAtMs: number;
    }
  | { readonly type: 'hash' | 'list' };

/**
 * In-memory stand-in for the three Redis commands the rates repository uses. Expiry follows
 * `Date.now()`, so Jest fake timers drive it; like Redis `EX`, a key is gone only once more than
 * its seconds have passed.
 */
export class FakeRedisCommands implements RatesRedisCommands {
  readonly get = jest.fn<Promise<string | null>, [string]>((key) =>
    this.run('get', () => {
      const entry = this.live(key);
      if (entry === undefined) {
        return null;
      }
      if (entry.type !== 'string') {
        throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
      }
      return entry.value;
    }),
  );

  readonly set = jest.fn<Promise<unknown>, [string, string, 'EX', number]>(
    (key, value, _token, seconds) =>
      this.run('set', () => {
        this.entries.set(key, {
          type: 'string',
          value,
          seconds,
          expiresAtMs: Date.now() + seconds * 1000,
        });
        return 'OK';
      }),
  );

  readonly del = jest.fn<Promise<number>, [string]>((key) =>
    this.run('del', () => {
      const existed = this.live(key) !== undefined;
      this.entries.delete(key);
      return existed ? 1 : 0;
    }),
  );

  private readonly entries = new Map<string, Entry>();
  private readonly failures = new Map<FakeCommand, Error>();
  private readonly hanging = new Set<FakeCommand>();
  private disconnected = false;

  putString(key: string, value: string): void {
    this.entries.set(key, {
      type: 'string',
      value,
      seconds: Number.POSITIVE_INFINITY,
      expiresAtMs: Number.POSITIVE_INFINITY,
    });
  }

  /** GET on this key then rejects with a WRONGTYPE reply error. */
  putHash(key: string): void {
    this.entries.set(key, { type: 'hash' });
  }

  putList(key: string): void {
    this.entries.set(key, { type: 'list' });
  }

  valueOf(key: string): string | undefined {
    const entry = this.live(key);
    return entry?.type === 'string' ? entry.value : undefined;
  }

  expirySecondsOf(key: string): number | undefined {
    const entry = this.live(key);
    return entry?.type === 'string' && Number.isFinite(entry.seconds) ? entry.seconds : undefined;
  }

  failWith(error: Error, commands: readonly FakeCommand[] = ALL_COMMANDS): void {
    for (const command of commands) {
      this.failures.set(command, error);
    }
  }

  /** The listed commands never settle. */
  hang(commands: readonly FakeCommand[] = ALL_COMMANDS): void {
    for (const command of commands) {
      this.hanging.add(command);
    }
  }

  /** Every command rejects at once, as ioredis does with the offline queue disabled. */
  disconnect(): void {
    this.disconnected = true;
  }

  recover(): void {
    this.disconnected = false;
    this.failures.clear();
    this.hanging.clear();
  }

  private run<T>(command: FakeCommand, reply: () => T): Promise<T> {
    if (this.disconnected) {
      return Promise.reject(
        new Error("Stream isn't writeable and enableOfflineQueue options is false"),
      );
    }
    if (this.hanging.has(command)) {
      return new Promise<T>(() => undefined);
    }
    const failure = this.failures.get(command);
    if (failure !== undefined) {
      return Promise.reject(failure);
    }
    // A reply that throws (WRONGTYPE) becomes a rejection, as the executor catches it.
    return new Promise<T>((resolve) => resolve(reply()));
  }

  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry?.type === 'string' && Date.now() > entry.expiresAtMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }
}
