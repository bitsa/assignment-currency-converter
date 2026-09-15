import { UpstreamInvalidResponseError } from '../errors/upstream-invalid-response.error';
import type { MonobankItem } from './monobank-item.types';

const RATE_FIELDS = ['rateBuy', 'rateSell', 'rateCross'] as const;

/** Largest Unix-seconds value `new Date(date * 1000)` turns into a valid instant. */
const MAX_DATE_SECONDS = 8.64e12;

/**
 * Body text → validated items. Throws UpstreamInvalidResponseError for an empty, non-JSON,
 * non-array or empty-array body, or for any item that breaks the item rules.
 */
export function parseMonobankBody(body: string): readonly MonobankItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new UpstreamInvalidResponseError('body is not valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new UpstreamInvalidResponseError('body is not an array');
  }
  if (parsed.length === 0) {
    throw new UpstreamInvalidResponseError('array has no items');
  }
  return parsed.map((element: unknown, index) => parseItem(element, index));
}

function parseItem(element: unknown, index: number): MonobankItem {
  const fail = (rule: string): never => {
    throw new UpstreamInvalidResponseError(`item ${index}: ${rule}`);
  };
  if (typeof element !== 'object' || element === null || Array.isArray(element)) {
    return fail('must be an object');
  }
  const raw = element as Record<string, unknown>;
  const currencyCodeA = raw['currencyCodeA'];
  const currencyCodeB = raw['currencyCodeB'];
  const date = raw['date'];
  if (!Number.isInteger(currencyCodeA)) {
    fail('currencyCodeA must be an integer');
  }
  if (!Number.isInteger(currencyCodeB)) {
    fail('currencyCodeB must be an integer');
  }
  if (!Number.isSafeInteger(date) || (date as number) <= 0 || (date as number) > MAX_DATE_SECONDS) {
    fail('date must be a positive integer of Unix seconds');
  }

  const item: {
    currencyCodeA: number;
    currencyCodeB: number;
    date: number;
    rateBuy?: number;
    rateSell?: number;
    rateCross?: number;
  } = {
    currencyCodeA: currencyCodeA as number,
    currencyCodeB: currencyCodeB as number,
    date: date as number,
  };
  for (const field of RATE_FIELDS) {
    if (!(field in raw)) {
      continue;
    }
    const value = raw[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      fail(`${field} must be a finite number > 0`);
    }
    item[field] = value as number;
  }
  if (RATE_FIELDS.every((field) => item[field] === undefined)) {
    fail('has none of rateBuy, rateSell and rateCross');
  }
  return item;
}
