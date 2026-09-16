import type { CurrencyCode } from '../../currency/currency-code';
import type { Rate, RateSnapshot } from '../../rates/rate.types';

/** Quote lookup by pair over one snapshot; the first quote for a pair wins. */
export class SnapshotQuotes {
  private readonly byPair = new Map<string, Rate>();

  constructor(readonly snapshot: RateSnapshot) {
    for (const rate of snapshot.rates) {
      const key = pairKey(rate.base, rate.quote);
      if (!this.byPair.has(key)) {
        this.byPair.set(key, rate);
      }
    }
  }

  find(base: CurrencyCode, quote: CurrencyCode): Rate | undefined {
    return this.byPair.get(pairKey(base, quote));
  }
}

function pairKey(base: CurrencyCode, quote: CurrencyCode): string {
  return `${base.value}/${quote.value}`;
}
