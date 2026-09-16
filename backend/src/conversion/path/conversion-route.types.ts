import type { CurrencyCode } from '../../currency/currency-code';
import type { ConversionLeg } from '../legs/conversion-leg.types';
import type { SnapshotQuotes } from '../legs/snapshot-quotes';

export interface RouteRequest {
  readonly quotes: SnapshotQuotes;
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
}

export interface ConversionRoute {
  /** Currencies visited, `from` first and `to` last (`[from]` when they are equal). */
  readonly path: readonly CurrencyCode[];
  /** Empty for the same-currency route. */
  readonly legs: readonly ConversionLeg[];
}
