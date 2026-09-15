import { CurrencyCode } from '../../currency/currency-code';
import { DomainDecimal, type DomainDecimalValue } from '../../currency/domain-decimal';
import { InvalidRateError } from '../../currency/errors/invalid-rate.error';
import { createRate } from '../rate.factory';
import type { Rate, RateSnapshot } from '../rate.types';

const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Checked before `CurrencyCode.of`, which would otherwise accept lower case. */
const UPPER_ALPHA_CODE = /^[A-Z]{3}$/;
/** Plain positive notation only: no sign, no exponent. Zero is rejected by the rate rules. */
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;
const VALUE_KEYS = ['buy', 'sell', 'cross'] as const;

type StoredValues = Partial<Record<(typeof VALUE_KEYS)[number], string>>;

interface StoredRate extends StoredValues {
  readonly base: string;
  readonly quote: string;
  readonly asOf: string;
}

/** The JSON document stored under the cache key. Decimals are strings, so they stay exact. */
export function serializeSnapshot(snapshot: RateSnapshot): string {
  return JSON.stringify({
    rates: snapshot.rates.map((rate): StoredRate => {
      const values: StoredValues = {};
      for (const key of VALUE_KEYS) {
        const value = rate[key];
        if (value !== undefined) {
          // toFixed() with no argument: plain notation, never `1.2e-7`.
          values[key] = value.toFixed();
        }
      }
      return {
        base: rate.base.value,
        quote: rate.quote.value,
        ...values,
        asOf: rate.asOf.toISOString(),
      };
    }),
    fetchedAt: snapshot.fetchedAt.toISOString(),
  });
}

/** Frozen snapshot, or null when the stored text is corrupt. Unknown extra fields are ignored. */
export function parseStoredSnapshot(text: string): RateSnapshot | null {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(document) || !Array.isArray(document['rates'])) {
    return null;
  }
  const storedRates: unknown[] = document['rates'];
  const fetchedAt = parseTimestamp(document['fetchedAt']);
  if (storedRates.length === 0 || fetchedAt === null) {
    return null;
  }
  const rates: Rate[] = [];
  for (const stored of storedRates) {
    const rate = parseRate(stored);
    if (rate === null) {
      return null;
    }
    rates.push(rate);
  }
  return Object.freeze({ rates: Object.freeze(rates), fetchedAt });
}

function parseRate(stored: unknown): Rate | null {
  if (!isObject(stored)) {
    return null;
  }
  const base = parseCode(stored['base']);
  const quote = parseCode(stored['quote']);
  const asOf = parseTimestamp(stored['asOf']);
  if (base === null || quote === null || asOf === null) {
    return null;
  }
  const values: {
    buy?: DomainDecimalValue;
    sell?: DomainDecimalValue;
    cross?: DomainDecimalValue;
  } = {};
  for (const key of VALUE_KEYS) {
    if (!Object.hasOwn(stored, key)) {
      continue;
    }
    const raw = stored[key];
    if (typeof raw !== 'string' || !PLAIN_DECIMAL.test(raw)) {
      return null;
    }
    values[key] = new DomainDecimal(raw);
  }
  try {
    return createRate({ base, quote, ...values, asOf });
  } catch (error) {
    if (error instanceof InvalidRateError) {
      return null;
    }
    throw error;
  }
}

function parseCode(raw: unknown): CurrencyCode | null {
  if (typeof raw !== 'string' || !UPPER_ALPHA_CODE.test(raw)) {
    return null;
  }
  try {
    return CurrencyCode.of(raw);
  } catch {
    return null;
  }
}

function parseTimestamp(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !ISO_UTC_MILLIS.test(raw)) {
    return null;
  }
  const date = new Date(raw);
  // Rejects calendar overflow such as 2026-02-30, which Date would silently roll forward.
  return !Number.isNaN(date.getTime()) && date.toISOString() === raw ? date : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
