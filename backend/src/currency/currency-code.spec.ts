import { REFERENCE_CURRENCIES } from '../testing/currency-reference';
import { CurrencyCode } from './currency-code';
import { UnsupportedCurrencyError } from './errors/unsupported-currency.error';

describe('CurrencyCode', () => {
  it('lists every supported currency code once', () => {
    const values = CurrencyCode.all().map((code) => code.value);

    expect(values).toHaveLength(159);
    expect(new Set(values).size).toBe(159);
    expect([...values].sort()).toEqual(REFERENCE_CURRENCIES.map((c) => c.alpha).sort());
    for (const code of CurrencyCode.all()) {
      expect(CurrencyCode.of(code.value)).toBe(code);
    }
  });

  it('reports minor units 0 for JPY, 2 for USD, UAH and HUF, and 3 for BHD and IQD', () => {
    const minorUnits = ['JPY', 'USD', 'UAH', 'HUF', 'BHD', 'IQD'].map(
      (alpha) => CurrencyCode.of(alpha).minorUnits,
    );

    expect(minorUnits).toEqual([0, 2, 2, 2, 3, 3]);
  });

  it.each(REFERENCE_CURRENCIES)(
    'reports $minorUnits minor units for $alpha for every supported currency',
    ({ alpha, numeric, minorUnits }) => {
      const code = CurrencyCode.of(alpha);

      expect(code.minorUnits).toBe(minorUnits);
      expect(code.numericCode).toBe(numeric);
    },
  );

  it('reports the ISO name US Dollar for USD and Hryvnia for UAH', () => {
    expect(CurrencyCode.of('USD').name).toBe('US Dollar');
    expect(CurrencyCode.of('UAH').name).toBe('Hryvnia');
  });

  it('accepts supported codes Monobank does not quote, such as RUB and MRU', () => {
    expect(CurrencyCode.of('RUB').value).toBe('RUB');
    expect(CurrencyCode.of('MRU').value).toBe('MRU');
  });

  it('normalises usd, Usd and USD to USD', () => {
    for (const input of ['usd', 'Usd', 'USD']) {
      expect(CurrencyCode.of(input).value).toBe('USD');
    }
  });

  it('trims leading and trailing whitespace around a code, so " eur" with a tab becomes EUR', () => {
    expect(CurrencyCode.of(' eur\t').value).toBe('EUR');
  });

  it('treats codes created from usd and " USD " as equal', () => {
    const a = CurrencyCode.of('usd');
    const b = CurrencyCode.of(' USD ');

    expect(a.equals(b)).toBe(true);
    expect(a.equals(CurrencyCode.of('EUR'))).toBe(false);
    expect(String(a)).toBe('USD');
  });

  it('includes the rejected input XAU in the unsupported currency message', () => {
    expect(() => CurrencyCode.of('XAU')).toThrow('XAU');
    expect(() => CurrencyCode.of('XAU')).toThrow('currency "XAU" is not supported');
  });

  it('rejects three-letter codes outside the table (XAU, XDR, BOV, XTS, ZZZ) with UnsupportedCurrencyError', () => {
    for (const input of ['XAU', 'XDR', 'BOV', 'XTS', 'ZZZ']) {
      expect(() => CurrencyCode.of(input)).toThrow(UnsupportedCurrencyError);
    }
  });

  it('rejects strings that are not three ASCII letters after trimming ("", "   ", "US", "USDX", "U SD", "U$D", "840") with UnsupportedCurrencyError', () => {
    for (const input of ['', '   ', 'US', 'USDX', 'U SD', 'U$D', '840']) {
      expect(() => CurrencyCode.of(input)).toThrow(UnsupportedCurrencyError);
    }
  });

  it('rejects non-ASCII letters even when they upper-case to a supported code (full-width USD, "uſd")', () => {
    for (const input of ['ＵＳＤ', 'uſd']) {
      expect(() => CurrencyCode.of(input)).toThrow(UnsupportedCurrencyError);
    }
  });

  it('rejects non-string input (null, undefined, 840, {}) with UnsupportedCurrencyError', () => {
    for (const input of [null, undefined, 840, {}]) {
      expect(() => CurrencyCode.of(input)).toThrow(UnsupportedCurrencyError);
    }
  });
});
