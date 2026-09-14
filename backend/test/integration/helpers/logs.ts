export type LogLine = Readonly<Record<string, unknown>>;

export const ESC = String.fromCharCode(27);

const ANSI_SEQUENCE = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g');

export const LOWER_CASE_LEVELS: readonly string[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];

export function stripAnsi(text: string): string {
  return text.replace(ANSI_SEQUENCE, '');
}

export function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim() !== '');
}

function parseObject(line: string): LogLine | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as LogLine)
      : undefined;
  } catch {
    return undefined;
  }
}

export function isJsonObjectLine(line: string): boolean {
  return parseObject(line) !== undefined;
}

/** Parses every non-empty stdout line; throws on the first line that is not a JSON object. */
export function jsonLines(stdout: string): LogLine[] {
  return nonEmptyLines(stdout).map((line) => {
    const parsed = parseObject(line);
    if (parsed === undefined) {
      throw new Error(`stdout line is not a JSON object: ${line}`);
    }
    return parsed;
  });
}

export function levelOf(line: LogLine): string | undefined {
  return typeof line.level === 'string' ? line.level : undefined;
}

export function mentions(line: LogLine, text: string): boolean {
  return JSON.stringify(line).includes(text);
}

function containsValue(value: unknown, target: string | number): boolean {
  if (value === target) {
    return true;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some((nested: unknown) => containsValue(nested, target));
  }
  return false;
}

export interface CompletionQuery {
  readonly uuid: string;
  readonly method: string;
  readonly status: number;
}

/**
 * Completion lines for one request: they mention `uuid`, carry a non-empty string `reqId`,
 * and hold the method (string) and status (number) as values somewhere in the object. Only
 * `reqId` and `level` have fixed field names.
 */
export function completion(lines: readonly LogLine[], query: CompletionQuery): LogLine[] {
  return lines.filter(
    (line) =>
      mentions(line, query.uuid) &&
      typeof line.reqId === 'string' &&
      line.reqId !== '' &&
      containsValue(line, query.method) &&
      containsValue(line, query.status),
  );
}
