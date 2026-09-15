export interface Fixture {
  /** Served byte for byte, so number formatting survives. */
  readonly text: string;
  /** Length of the array. */
  readonly items: number;
}

/** `undefined` when the text is not JSON or not an array. Items are not validated. */
export function parseFixture(text: string): Fixture | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return Array.isArray(parsed) ? { text, items: parsed.length } : undefined;
}
