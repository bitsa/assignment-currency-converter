import { CurrencyCode } from '../../currency/currency-code';
import { snapshotOf, type QuoteInput } from '../../testing/rate-snapshots';
import { RateLegSelector } from './rate-leg-selector';
import { SnapshotQuotes } from './snapshot-quotes';

const UAH = CurrencyCode.of('UAH');
const USD = CurrencyCode.of('USD');
const GBP = CurrencyCode.of('GBP');
const EUR = CurrencyCode.of('EUR');
const AS_OF = '2026-09-11T08:00:00.000Z';

const selector = new RateLegSelector();

function quotes(...inputs: QuoteInput[]): SnapshotQuotes {
  return new SnapshotQuotes(snapshotOf(inputs));
}

describe('RateLegSelector', () => {
  it('uses buy for base to quote and sell for quote to base', () => {
    const snapshot = quotes({
      base: 'USD',
      quote: 'UAH',
      buy: '41.1',
      sell: '41.6',
      cross: '41.3',
      asOf: AS_OF,
    });

    const sold = selector.direct(snapshot, USD, UAH);
    const bought = selector.inverse(snapshot, UAH, USD);

    expect(sold?.value.toFixed()).toBe('41.1');
    expect(sold?.operation).toBe('multiply');
    expect([sold?.from.value, sold?.to.value]).toEqual(['USD', 'UAH']);
    expect(bought?.value.toFixed()).toBe('41.6');
    expect(bought?.operation).toBe('divide');
    expect([bought?.from.value, bought?.to.value]).toEqual(['UAH', 'USD']);
  });

  it('uses cross in the quote-to-base direction when the quote has no sell rate', () => {
    const snapshot = quotes({ base: 'GBP', quote: 'UAH', cross: '55.4', asOf: AS_OF });

    const leg = selector.inverse(snapshot, UAH, GBP);

    expect(leg?.value.toFixed()).toBe('55.4');
    expect(leg?.operation).toBe('divide');
    expect(selector.direct(snapshot, GBP, UAH)?.value.toFixed()).toBe('55.4');
  });

  it('finds no leg when the quote lacks both the needed side and cross', () => {
    const buyOnly = quotes({ base: 'USD', quote: 'UAH', buy: '41.1', asOf: AS_OF });
    const sellOnly = quotes({ base: 'USD', quote: 'UAH', sell: '41.6', asOf: AS_OF });

    expect(selector.inverse(buyOnly, UAH, USD)).toBeUndefined();
    expect(selector.best(buyOnly, UAH, USD)).toBeUndefined();
    expect(selector.direct(sellOnly, USD, UAH)).toBeUndefined();
    expect(selector.best(sellOnly, USD, UAH)).toBeUndefined();
    expect(selector.best(buyOnly, EUR, UAH)).toBeUndefined();
  });

  it('prefers the direct leg over the inverse one', () => {
    const snapshot = quotes(
      { base: 'EUR', quote: 'USD', buy: '1.156', sell: '1.172', asOf: AS_OF },
      { base: 'USD', quote: 'EUR', buy: '0.8', sell: '0.9', asOf: AS_OF },
    );

    expect(selector.best(snapshot, EUR, USD)?.value.toFixed()).toBe('1.156');
    expect(selector.best(snapshot, USD, EUR)?.value.toFixed()).toBe('0.8');
  });

  it('keeps the first quote of a pair that appears twice', () => {
    const snapshot = quotes(
      { base: 'USD', quote: 'UAH', buy: '41.1', asOf: AS_OF },
      { base: 'USD', quote: 'UAH', buy: '99', asOf: AS_OF },
    );

    expect(selector.direct(snapshot, USD, UAH)?.value.toFixed()).toBe('41.1');
  });
});
