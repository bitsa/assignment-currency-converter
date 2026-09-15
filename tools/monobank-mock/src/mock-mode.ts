export const MOCK_MODES = ['ok', 'http500', 'http429', 'timeout', 'malformed', 'empty'] as const;

export type MockMode = (typeof MOCK_MODES)[number];

/** Exact, case-sensitive match. */
export function isMockMode(value: unknown): value is MockMode {
  return typeof value === 'string' && (MOCK_MODES as readonly string[]).includes(value);
}
