export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls `probe` until it returns something other than `undefined`, or until `timeoutMs` has
 * passed. Returns the last value (`undefined` on timeout).
 */
export async function pollUntil<T>(
  probe: () => T | undefined | Promise<T | undefined>,
  timeoutMs: number,
  intervalMs = 1000,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return undefined;
    }
    await delay(Math.min(intervalMs, remaining));
  }
}
