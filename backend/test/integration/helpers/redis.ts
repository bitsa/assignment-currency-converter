import { TEST_STACK_ENV } from './mock';
import type { RunResult } from './run';
import { compose } from './stack';

/** Runs `redis-cli` inside the test stack's `redis` container. */
export function redisCli(args: readonly string[]): Promise<RunResult> {
  return compose(['exec', '-T', 'redis', 'redis-cli', ...args], { env: TEST_STACK_ENV });
}
