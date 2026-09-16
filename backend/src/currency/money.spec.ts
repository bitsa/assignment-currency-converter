import { unroundedMoney } from '../testing/money';
import { CurrencyCode } from './currency-code';
import { CurrencyMismatchError } from './errors/currency-mismatch.error';
import { InvalidAmountError } from './errors/invalid-amount.error';
import { InvalidRateError } from './errors/invalid-rate.error';
import { JsonNumber } from './json-number';
import { Money } from './money';

const USD = CurrencyCode.of('USD');
const UAH = CurrencyCode.of('UAH');
const EUR = CurrencyCode.of('EUR');

function money(amount: string, currency: CurrencyCode): Money {
  return Money.parseClientAmount(amount, currency);
}

describe('Money arithmetic', () => {
  it('multiplies 0.1 USD by the rate 3 to exactly 0.3', () => {
    expect(money('0.1', USD).multiplyByRate(3, USD).amount.equals('0.3')).toBe(true);
  });

  it('multiplies 100000 USD by 51.9994 into exactly 5199940 UAH', () => {
    const result = money('100000', USD).multiplyByRate('51.9994', UAH);

    expect(result.amount.equals('5199940')).toBe(true);
    expect(result.currency).toBe(UAH);
  });

  it('keeps full precision across two legs, so 0.01 USD times 0.5 times 3 rounds to 0.02', () => {
    const result = money('0.01', USD).multiplyByRate('0.5', USD).multiplyByRate(3, USD);

    expect(result.round().toFixed()).toBe('0.02');
  });

  it('divides 100000 UAH by 51.9994 into EUR and rounds to exactly 1923.10', () => {
    const result = money('100000', UAH).divideByRate('51.9994', EUR).round();

    expect(result.toFixed()).toBe('1923.10');
    expect(result.amount.equals('1923.1')).toBe(true);
  });

  it('returns exactly 100.00 USD after dividing and multiplying 100 USD by 51.9994', () => {
    const result = money('100', USD)
      .divideByRate('51.9994', UAH)
      .multiplyByRate('51.9994', USD)
      .round();

    expect(result.toFixed()).toBe('100.00');
  });

  it('leaves the original money unchanged after multiplying or dividing by a rate', () => {
    const original = money('100', USD);

    original.multiplyByRate(2, USD);
    original.divideByRate(2, USD);

    expect(original.amount.equals('100')).toBe(true);
    expect(original.currency).toBe(USD);
    expect(Object.isFrozen(original)).toBe(true);
  });

  it('labels the result of multiplying 100 USD by 41.10 into UAH with UAH', () => {
    expect(money('100', USD).multiplyByRate('41.10', UAH).currency).toBe(UAH);
    expect(money('100', UAH).divideByRate('41.10', USD).currency).toBe(USD);
  });

  it('multiplies a 43-digit amount by 1e-33 exactly, keeping it just above 4500000', () => {
    const result = money('4500000000000000000000000000000000000000.01', USD).multiplyByRate(
      '1e-33',
      UAH,
    );

    expect(result.amount.equals('4500000.00000000000000000000000000000000001')).toBe(true);
    expect(result.amount.gt(4500000)).toBe(true);
  });

  it('divides a 43-digit amount by 1e33 without rounding it down to 4500000', () => {
    const result = money('4500000000000000000000000000000000000000.01', UAH).divideByRate(
      '1e33',
      USD,
    );

    expect(result.amount.gt(4500000)).toBe(true);
  });

  it('rejects a rate with more than 20 significant digits with InvalidRateError', () => {
    const base = money('100', USD);

    expect(() => base.multiplyByRate('1.00000000000000000001', UAH)).toThrow(InvalidRateError);
    expect(() => base.divideByRate('1.00000000000000000001', UAH)).toThrow(InvalidRateError);
    expect(() => base.multiplyByRate('1.0000000000000000001', UAH)).not.toThrow();
  });

  it('rejects a zero, negative, NaN, infinite or non-numeric rate with InvalidRateError when multiplying or dividing', () => {
    const rates = [0, '0', -1, '-41.1', Number.NaN, Infinity, -Infinity, 'abc', ''];
    const base = money('100', USD);
    for (const rate of rates) {
      expect(() => base.multiplyByRate(rate, UAH)).toThrow(InvalidRateError);
      expect(() => base.divideByRate(rate, UAH)).toThrow(InvalidRateError);
    }
  });
});

describe('Money rounding and rendering', () => {
  it('rounds USD half-even to 2 decimals: 2.345 to 2.34, 2.355 to 2.36, 2.3451 to 2.35', () => {
    expect(unroundedMoney('2.345', 'USD').round().toFixed()).toBe('2.34');
    expect(unroundedMoney('2.355', 'USD').round().toFixed()).toBe('2.36');
    expect(unroundedMoney('2.3451', 'USD').round().toFixed()).toBe('2.35');
  });

  it('rounds JPY half-even to 0 decimals: 2.5 to 2, 3.5 to 4, 100.4999 to 100', () => {
    expect(unroundedMoney('2.5', 'JPY').round().amount.equals('2')).toBe(true);
    expect(unroundedMoney('3.5', 'JPY').round().amount.equals('4')).toBe(true);
    expect(unroundedMoney('100.4999', 'JPY').round().amount.equals('100')).toBe(true);
  });

  it('rounds BHD half-even to 3 decimals: 1.2345 to 1.234, 1.2355 to 1.236', () => {
    expect(unroundedMoney('1.2345', 'BHD').round().amount.equals('1.234')).toBe(true);
    expect(unroundedMoney('1.2355', 'BHD').round().amount.equals('1.236')).toBe(true);
  });

  it('renders rounded amounts in fixed notation with the currency\'s minor units: "100.50", "100", "1.000", "5199940.00"', () => {
    expect(money('100.5', USD).round().toFixed()).toBe('100.50');
    expect(money('100', CurrencyCode.of('JPY')).round().toFixed()).toBe('100');
    expect(money('1', CurrencyCode.of('BHD')).round().toFixed()).toBe('1.000');
    expect(money('100000', USD).multiplyByRate('51.9994', UAH).round().toFixed()).toBe(
      '5199940.00',
    );
  });

  it('rounds 0.004 USD to "0.00" without throwing', () => {
    const rounded = unroundedMoney('0.004', 'USD').round();

    expect(rounded.toFixed()).toBe('0.00');
    expect(rounded.amount.isZero()).toBe(true);
  });

  it('returns the same value when rounding 2.34 USD, which is already at 2 decimals', () => {
    expect(money('2.34', USD).round().amount.equals('2.34')).toBe(true);
  });
});

describe('Money comparison', () => {
  it('reports 100.00 USD as less than 100.5 USD', () => {
    expect(money('100.00', USD).compareTo(money('100.5', USD))).toBe(-1);
    expect(money('100.5', USD).compareTo(money('100.00', USD))).toBe(1);
  });

  it('reports 100.5 USD and 100.50 USD as equal', () => {
    expect(money('100.5', USD).compareTo(money('100.50', USD))).toBe(0);
  });

  it('throws CurrencyMismatchError when comparing 100 USD with 100 EUR', () => {
    expect(() => money('100', USD).compareTo(money('100', EUR))).toThrow(CurrencyMismatchError);
  });
});

describe('Money client amount format', () => {
  it("checks an amount's format and sign without a currency", () => {
    for (const input of ['1.12345', ' 100.50 ', new JsonNumber('0.100000000000000005')]) {
      expect(() => Money.assertClientAmountFormat(input)).not.toThrow();
    }
    for (const input of ['abc', '1e3', '+5', true, 5, new JsonNumber('NaN')]) {
      expect(() => Money.assertClientAmountFormat(input)).toThrow(
        InvalidAmountError.notANumber().message,
      );
    }
    for (const input of ['0.00', '-1', new JsonNumber('-0'), new JsonNumber('0')]) {
      expect(() => Money.assertClientAmountFormat(input)).toThrow(
        InvalidAmountError.notPositive().message,
      );
    }
  });
});
