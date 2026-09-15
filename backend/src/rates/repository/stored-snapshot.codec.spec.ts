import { describeSnapshot, sampleSnapshot } from '../../testing/rate-snapshots';
import { parseStoredSnapshot, serializeSnapshot } from './stored-snapshot.codec';

const FETCHED_AT = new Date('2026-09-11T08:00:05.000Z');

const USD_UAH = {
  base: 'USD',
  quote: 'UAH',
  buy: '41.1',
  sell: '41.6',
  asOf: '2026-09-11T08:00:00.000Z',
};

function storedWith(rate: Record<string, unknown>): string {
  return JSON.stringify({ rates: [rate], fetchedAt: '2026-09-11T08:00:05.000Z' });
}

function without(key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...USD_UAH };
  delete copy[key];
  return copy;
}

describe('stored snapshot codec', () => {
  it('keeps 41.1 as 41.1, 0.0272 as 0.0272 and an absent value absent through serialize and parse', () => {
    const snapshot = sampleSnapshot(FETCHED_AT);

    const parsed = parseStoredSnapshot(serializeSnapshot(snapshot));

    expect(parsed).not.toBeNull();
    expect(describeSnapshot(parsed!)).toEqual(describeSnapshot(snapshot));
    expect(parsed!.rates[0]?.buy?.toFixed()).toBe('41.1');
    expect(parsed!.rates[2]?.cross?.toFixed()).toBe('0.0272');
    expect(Object.hasOwn(parsed!.rates[1]!, 'buy')).toBe(false);
  });

  it('writes decimal strings in plain notation and omits absent values', () => {
    const document = JSON.parse(serializeSnapshot(sampleSnapshot(FETCHED_AT))) as {
      rates: Record<string, unknown>[];
    };

    expect(document.rates[1]).toEqual({
      base: 'GBP',
      quote: 'UAH',
      cross: '55.4',
      asOf: '2026-09-11T05:00:00.000Z',
    });
  });

  it.each([
    ['a lower-case code', storedWith({ ...USD_UAH, base: 'usd' })],
    ['the same code on both sides', storedWith({ ...USD_UAH, quote: 'USD' })],
    ['a missing asOf', storedWith(without('asOf'))],
    ['no buy, sell or cross', storedWith({ base: 'USD', quote: 'UAH', asOf: USD_UAH.asOf })],
    [
      'more than 20 significant digits',
      storedWith({ ...USD_UAH, buy: '41.123456789012345678901' }),
    ],
    ['an exponent string', storedWith({ ...USD_UAH, buy: '1e3' })],
    ['a null value', storedWith({ ...USD_UAH, sell: null })],
    ['an invalid calendar date', storedWith({ ...USD_UAH, asOf: '2026-02-30T08:00:00.000Z' })],
  ])('treats %s as corrupt', (_label, text) => {
    expect(parseStoredSnapshot(text)).toBeNull();
  });

  it('returns a frozen snapshot with frozen rates', () => {
    const parsed = parseStoredSnapshot(serializeSnapshot(sampleSnapshot(FETCHED_AT)));

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.rates)).toBe(true);
    expect(parsed?.rates.every((rate) => Object.isFrozen(rate))).toBe(true);
  });
});
