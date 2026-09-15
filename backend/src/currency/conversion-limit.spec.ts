import { unroundedMoney } from '../testing/money';
import { thrownBy } from '../testing/thrown-by';
import { CONVERSION_LIMIT, assertWithinConversionLimit } from './conversion-limit';
import { CurrencyCode } from './currency-code';
import { CurrencyMismatchError } from './errors/currency-mismatch.error';
import { InvalidAmountError } from './errors/invalid-amount.error';
import { Money } from './money';

const UAH = CurrencyCode.of('UAH');

describe('conversion limit', () => {
  it('exposes the conversion limit as the money value 4500000.00 UAH', () => {
    expect(CONVERSION_LIMIT.currency).toBe(UAH);
    expect(CONVERSION_LIMIT.amount.equals('4500000')).toBe(true);
    expect(CONVERSION_LIMIT.toFixed()).toBe('4500000.00');
  });

  it('lets exactly 4500000.00 UAH pass the conversion limit check', () => {
    const limit = Money.parseClientAmount('4500000.00', UAH);

    expect(() => assertWithinConversionLimit(limit)).not.toThrow();
  });

  it('lets the unrounded 4499999.999999 UAH pass the conversion limit check', () => {
    const value = unroundedMoney('4499999.999999', 'UAH');

    expect(() => assertWithinConversionLimit(value)).not.toThrow();
  });

  it('rejects a UAH value above the limit with "amount exceeds the conversion limit of 4500000.00 UAH"', () => {
    const value = Money.parseClientAmount('4500000.01', UAH);

    expect(() => assertWithinConversionLimit(value)).toThrow(
      'amount exceeds the conversion limit of 4500000.00 UAH',
    );
  });

  it('rejects 4500000.01 UAH and the unrounded 4500000.000001 UAH with InvalidAmountError', () => {
    const values = [
      Money.parseClientAmount('4500000.01', UAH),
      unroundedMoney('4500000.000001', 'UAH'),
    ];
    for (const value of values) {
      expect(thrownBy(() => assertWithinConversionLimit(value))).toBeInstanceOf(InvalidAmountError);
    }
  });

  it('throws CurrencyMismatchError when a USD value is checked against the conversion limit', () => {
    const usd = Money.parseClientAmount('100000', CurrencyCode.of('USD'));

    expect(() => assertWithinConversionLimit(usd)).toThrow(CurrencyMismatchError);
  });
});
