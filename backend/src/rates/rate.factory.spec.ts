import { CurrencyCode } from '../currency/currency-code';
import { DomainDecimal } from '../currency/domain-decimal';
import { InvalidRateError } from '../currency/errors/invalid-rate.error';
import { createRate, type RateInput } from './rate.factory';

const USD = CurrencyCode.of('USD');
const UAH = CurrencyCode.of('UAH');
const AS_OF = new Date('2026-09-11T08:00:00.000Z');

describe('createRate', () => {
  it('creates a frozen rate with no key for an absent buy, sell or cross', () => {
    const rate = createRate({ base: USD, quote: UAH, buy: new DomainDecimal('41.1'), asOf: AS_OF });

    expect(Object.isFrozen(rate)).toBe(true);
    expect(rate.buy?.toString()).toBe('41.1');
    expect('sell' in rate).toBe(false);
    expect('cross' in rate).toBe(false);
    expect(rate.base).toBe(USD);
    expect(rate.quote).toBe(UAH);
    expect(rate.asOf).toBe(AS_OF);
  });

  it('rejects a rate with the same base and quote, no value, or a non-positive value with InvalidRateError', () => {
    const inputs: RateInput[] = [
      { base: UAH, quote: UAH, cross: new DomainDecimal('1'), asOf: AS_OF },
      { base: USD, quote: UAH, asOf: AS_OF },
      { base: USD, quote: UAH, buy: new DomainDecimal('0'), asOf: AS_OF },
      { base: USD, quote: UAH, sell: new DomainDecimal('-41.6'), asOf: AS_OF },
      { base: USD, quote: UAH, cross: new DomainDecimal(Infinity), asOf: AS_OF },
      { base: USD, quote: UAH, cross: new DomainDecimal('1.000000000000000000001'), asOf: AS_OF },
      { base: USD, quote: UAH, cross: new DomainDecimal('55.4'), asOf: new Date(Number.NaN) },
    ];

    for (const input of inputs) {
      expect(() => createRate(input)).toThrow(InvalidRateError);
    }
  });
});
