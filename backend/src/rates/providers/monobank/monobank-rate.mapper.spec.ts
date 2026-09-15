import { CurrencyCode } from '../../../currency/currency-code';
import { Money } from '../../../currency/money';
import type { MonobankItem } from './monobank-item.types';
import { mapMonobankItems } from './monobank-rate.mapper';

const DATE = 1789113600;

function item(
  a: number,
  b: number,
  rates: Partial<MonobankItem> = { rateCross: 1.5 },
): MonobankItem {
  return { currencyCodeA: a, currencyCodeB: b, date: DATE, ...rates };
}

function pairs(items: readonly MonobankItem[]): string[] {
  return mapMonobankItems(items).rates.map((rate) => `${rate.base.value}/${rate.quote.value}`);
}

describe('mapMonobankItems', () => {
  it('maps currencyCodeA 840 and currencyCodeB 980 to base USD and quote UAH', () => {
    const [rate] = mapMonobankItems([item(840, 980)]).rates;

    expect(rate?.base).toBe(CurrencyCode.of('USD'));
    expect(rate?.quote).toBe(CurrencyCode.of('UAH'));
  });

  it('sets asOf to 2026-09-11T08:00:00.000Z for date 1789113600', () => {
    const [rate] = mapMonobankItems([item(840, 980)]).rates;

    expect(rate?.asOf.toISOString()).toBe('2026-09-11T08:00:00.000Z');
  });

  it('keeps rateBuy 41.1 and rateSell 41.6 as exact decimals with no cross', () => {
    const [rate] = mapMonobankItems([item(840, 980, { rateBuy: 41.1, rateSell: 41.6 })]).rates;

    expect(rate?.buy?.toString()).toBe('41.1');
    expect(rate?.sell?.toString()).toBe('41.6');
    expect(rate !== undefined && 'cross' in rate).toBe(false);
  });

  it('produces a cross-only rate of exactly 55.4 with no buy or sell for an item with only rateCross', () => {
    const [rate] = mapMonobankItems([item(826, 980, { rateCross: 55.4 })]).rates;

    expect(rate?.cross?.toString()).toBe('55.4');
    expect(rate !== undefined && 'buy' in rate).toBe(false);
    expect(rate !== undefined && 'sell' in rate).toBe(false);
  });

  it('keeps a rate with buy set and sell absent when rateSell is missing', () => {
    const [rate] = mapMonobankItems([item(840, 980, { rateBuy: 41.1 })]).rates;

    expect(rate?.buy?.toString()).toBe('41.1');
    expect(rate !== undefined && 'sell' in rate).toBe(false);
  });

  it('exposes 0.0272 and 41.4501 exactly, so 3 × 0.0272 computes to exactly 0.0816', () => {
    const [rate] = mapMonobankItems([item(392, 980, { rateBuy: 0.0272, rateSell: 41.4501 })]).rates;
    const three = Money.parseClientAmount('3', CurrencyCode.of('JPY'));

    expect(rate?.buy?.toString()).toBe('0.0272');
    expect(rate?.sell?.toString()).toBe('41.4501');
    expect(
      rate?.buy && three.multiplyByRate(rate.buy, CurrencyCode.of('UAH')).amount.toString(),
    ).toBe('0.0816');
  });

  it('keeps a pair not quoted against UAH as EUR/USD', () => {
    expect(pairs([item(978, 840)])).toEqual(['EUR/USD']);
  });

  it('returns rates in the upstream item order', () => {
    expect(pairs([item(985, 980), item(840, 980), item(978, 840), item(826, 980)])).toEqual([
      'PLN/UAH',
      'USD/UAH',
      'EUR/USD',
      'GBP/UAH',
    ]);
  });

  it('skips an item with an unmapped numeric code such as 959 and keeps the others', () => {
    const mapped = mapMonobankItems([item(840, 980), item(959, 980), item(978, 980)]);

    expect(mapped.rates.map((rate) => rate.base.value)).toEqual(['USD', 'EUR']);
    expect(mapped.skipped.count).toBe(1);
  });

  it('reports distinct unknown codes, same-currency pairs and duplicate pairs with the skipped count', () => {
    const mapped = mapMonobankItems([
      item(840, 980),
      item(959, 980),
      item(999, 959),
      item(980, 980),
      item(980, 980),
      item(840, 980),
      item(840, 980),
    ]);

    expect(mapped.skipped).toEqual({
      count: 6,
      unknownCodes: [959, 999],
      sameCurrencyPairs: ['UAH/UAH'],
      duplicatePairs: ['USD/UAH'],
    });
  });

  it('keeps only the first rate when two items map to the same base and quote', () => {
    const mapped = mapMonobankItems([
      item(840, 980, { rateBuy: 41.1, rateSell: 41.6 }),
      item(840, 980, { rateBuy: 50, rateSell: 51 }),
    ]);

    expect(mapped.rates).toHaveLength(1);
    expect(mapped.rates[0]?.buy?.toString()).toBe('41.1');
  });

  it('skips an item whose two codes are the same currency', () => {
    const mapped = mapMonobankItems([item(980, 980), item(840, 980)]);

    expect(pairs([item(980, 980), item(840, 980)])).toEqual(['USD/UAH']);
    expect(mapped.skipped.sameCurrencyPairs).toEqual(['UAH/UAH']);
  });

  it('keeps both a pair and its inverse', () => {
    expect(pairs([item(840, 980), item(980, 840)])).toEqual(['USD/UAH', 'UAH/USD']);
  });
});
