import { Injectable } from '@nestjs/common';
import type { CurrencyCode } from '../../currency/currency-code';
import type { ConversionLeg } from './conversion-leg.types';
import type { SnapshotQuotes } from './snapshot-quotes';

/**
 * Default bank semantics for one leg. For a quote `base`/`quote`, `base` → `quote` multiplies by
 * `buy` (the bank buys `base`) and `quote` → `base` divides by `sell` (the bank sells `base`);
 * `cross` stands in when the needed side is absent. A quote with neither gives no leg.
 */
@Injectable()
export class RateLegSelector {
  /** Leg on the quote `from`/`to`. */
  direct(quotes: SnapshotQuotes, from: CurrencyCode, to: CurrencyCode): ConversionLeg | undefined {
    const rate = quotes.find(from, to);
    const value = rate?.buy ?? rate?.cross;
    if (rate === undefined || value === undefined) {
      return undefined;
    }
    return Object.freeze({ from, to, rate, value, operation: 'multiply' });
  }

  /** Leg on the quote `to`/`from`, used in reverse. */
  inverse(quotes: SnapshotQuotes, from: CurrencyCode, to: CurrencyCode): ConversionLeg | undefined {
    const rate = quotes.find(to, from);
    const value = rate?.sell ?? rate?.cross;
    if (rate === undefined || value === undefined) {
      return undefined;
    }
    return Object.freeze({ from, to, rate, value, operation: 'divide' });
  }

  /** The direct leg when usable, otherwise the inverse one. */
  best(quotes: SnapshotQuotes, from: CurrencyCode, to: CurrencyCode): ConversionLeg | undefined {
    return this.direct(quotes, from, to) ?? this.inverse(quotes, from, to);
  }
}
