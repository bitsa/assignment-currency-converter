import {
  MINOR_UNITS_0,
  MINOR_UNITS_2,
  MINOR_UNITS_3,
  REFERENCE_CURRENCIES,
} from '../testing/currency-reference';
import { CURRENCY_TABLE, numericToAlpha } from './currency-table';

describe('currency table', () => {
  it('supports exactly 159 currencies, the ISO 4217 list plus the withdrawn BGN, HRK and SLL, no more and no fewer', () => {
    expect(MINOR_UNITS_0).toHaveLength(16);
    expect(MINOR_UNITS_3).toHaveLength(7);
    expect(MINOR_UNITS_2).toHaveLength(136);

    const supported = CURRENCY_TABLE.map((info) => info.alpha).sort();
    const expected = REFERENCE_CURRENCIES.map((info) => info.alpha).sort();

    expect(supported).toHaveLength(159);
    expect(new Set(supported).size).toBe(159);
    expect(supported).toEqual(expected);
    expect(supported).toEqual(expect.arrayContaining(['BGN', 'HRK', 'SLL']));
  });

  it('maps 840, 980, 978 and 826 to USD, UAH, EUR and GBP', () => {
    expect([840, 980, 978, 826].map(numericToAlpha)).toEqual(['USD', 'UAH', 'EUR', 'GBP']);
  });

  it.each(REFERENCE_CURRENCIES)(
    'maps numeric code $numeric to $alpha for every supported currency',
    ({ alpha, numeric }) => {
      expect(numericToAlpha(numeric)).toBe(alpha);
    },
  );

  it('maps the withdrawn numeric codes 975, 191 and 694 to BGN, HRK and SLL', () => {
    expect([975, 191, 694].map(numericToAlpha)).toEqual(['BGN', 'HRK', 'SLL']);
  });

  it('returns no mapping without throwing for 959, 999, 0, -840, 840.5 and NaN', () => {
    for (const numeric of [959, 999, 0, -840, 840.5, Number.NaN]) {
      expect(numericToAlpha(numeric)).toBeUndefined();
    }
  });
});
