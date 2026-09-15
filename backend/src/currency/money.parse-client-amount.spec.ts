import { thrownBy } from '../testing/thrown-by';
import { CurrencyCode } from './currency-code';
import { InvalidAmountError } from './errors/invalid-amount.error';
import { UnsupportedCurrencyError } from './errors/unsupported-currency.error';
import { Money } from './money';

const USD = CurrencyCode.of('USD');
const JPY = CurrencyCode.of('JPY');
const BHD = CurrencyCode.of('BHD');
const IDR = CurrencyCode.of('IDR');

function expectMoney(money: Money, amount: string, currency: CurrencyCode): void {
  expect(money.amount.equals(amount)).toBe(true);
  expect(money.currency).toBe(currency);
}

function expectInvalidAmount(input: unknown, currency: CurrencyCode = USD): void {
  expect(thrownBy(() => Money.parseClientAmount(input, currency))).toBeInstanceOf(
    InvalidAmountError,
  );
}

describe('Money.parseClientAmount', () => {
  it('parses the JSON number 100.5 as 100.5 USD', () => {
    expectMoney(Money.parseClientAmount(100.5, USD), '100.5', USD);
  });

  it('parses the strings "100.50" and " 100.50 " as 100.5 USD', () => {
    expectMoney(Money.parseClientAmount('100.50', USD), '100.5', USD);
    expectMoney(Money.parseClientAmount(' 100.50 ', USD), '100.5', USD);
  });

  it("accepts amounts with exactly the currency's minor units: 0.01 USD, 100 JPY and 1.234 BHD", () => {
    expectMoney(Money.parseClientAmount('0.01', USD), '0.01', USD);
    expectMoney(Money.parseClientAmount('100', JPY), '100', JPY);
    expectMoney(Money.parseClientAmount('1.234', BHD), '1.234', BHD);
  });

  it('ignores trailing zeros when counting decimals, so "100.500" USD is 100.5 and "100.0" JPY is 100', () => {
    expectMoney(Money.parseClientAmount('100.500', USD), '100.5', USD);
    expectMoney(Money.parseClientAmount('100.0', JPY), '100', JPY);
  });

  it('accepts a large well-formed amount such as "2000000000" IDR at parse time', () => {
    expectMoney(Money.parseClientAmount('2000000000', IDR), '2000000000', IDR);
  });

  it('rejects zero and negative amounts with "amount must be a positive number"', () => {
    for (const input of [0, '0', '0.00', -1, '-1', -0.01, -0, '-0']) {
      expect(() => Money.parseClientAmount(input, USD)).toThrow('amount must be a positive number');
    }
  });

  it('rejects "1.5" JPY with "amount must have at most 0 decimal places for JPY"', () => {
    expect(() => Money.parseClientAmount('1.5', JPY)).toThrow(
      'amount must have at most 0 decimal places for JPY',
    );
  });

  it('rejects "100.505" USD with "amount must have at most 2 decimal places for USD"', () => {
    expect(() => Money.parseClientAmount('100.505', USD)).toThrow(
      'amount must have at most 2 decimal places for USD',
    );
  });

  it('rejects input that is not a number or plain decimal string with "amount must be a number or a numeric string"', () => {
    for (const input of [Number.NaN, Infinity, null, true, {}, '1e3', 'abc', '007.50']) {
      expect(() => Money.parseClientAmount(input, USD)).toThrow(
        'amount must be a number or a numeric string',
      );
    }
  });

  it('rejects the negative amounts -1, "-1" and -0.01 with InvalidAmountError', () => {
    for (const input of [-1, '-1', -0.01]) {
      expectInvalidAmount(input);
    }
  });

  it('rejects the zero amounts 0, "0" and "0.00" with InvalidAmountError', () => {
    for (const input of [0, '0', '0.00']) {
      expectInvalidAmount(input);
    }
  });

  it('rejects negative zero given as -0 or "-0" with InvalidAmountError', () => {
    for (const input of [-0, '-0']) {
      expectInvalidAmount(input);
    }
  });

  it('rejects NaN, Infinity and -Infinity with InvalidAmountError', () => {
    for (const input of [Number.NaN, Infinity, -Infinity]) {
      expectInvalidAmount(input);
    }
  });

  it('rejects amounts that are neither numbers nor strings (null, undefined, true, [], {}) with InvalidAmountError', () => {
    for (const input of [null, undefined, true, [], {}]) {
      expectInvalidAmount(input);
    }
  });

  it('rejects strings that are not plain decimal notation ("", "   ", "1e3", "+5", ".5", "5.", "1,000", "0x10", "abc", "100 USD", "Infinity") with InvalidAmountError', () => {
    const inputs = [
      '',
      '   ',
      '1e3',
      '+5',
      '.5',
      '5.',
      '1,000',
      '0x10',
      'abc',
      '100 USD',
      'Infinity',
    ];
    for (const input of inputs) {
      expectInvalidAmount(input);
    }
  });

  it('rejects strings with leading zeros ("007.50", "0100", "00.5") with InvalidAmountError', () => {
    for (const input of ['007.50', '0100', '00.5']) {
      expectInvalidAmount(input);
    }
  });

  it('rejects amounts with more decimals than the minor units ("100.505" USD, "1.5" JPY, 0.001 USD, "1.2345" BHD) with InvalidAmountError', () => {
    expectInvalidAmount('100.505', USD);
    expectInvalidAmount('1.5', JPY);
    expectInvalidAmount(0.001, USD);
    expectInvalidAmount('1.2345', BHD);
  });

  it('rejects the JSON number 0.30000000000000004 for USD because its shortest decimal form has too many decimals', () => {
    expect(() => Money.parseClientAmount(0.1 + 0.2, USD)).toThrow(
      'amount must have at most 2 decimal places for USD',
    );
  });

  it('rejects an amount for the unsupported currency XAU with UnsupportedCurrencyError', () => {
    expect(() => Money.parseClientAmount('100', CurrencyCode.of('XAU'))).toThrow(
      UnsupportedCurrencyError,
    );
  });

  it('reports "amount must be a positive number" first when "-1.555" USD breaks several rules', () => {
    expect(() => Money.parseClientAmount('-1.555', USD)).toThrow(
      'amount must be a positive number',
    );
  });
});
