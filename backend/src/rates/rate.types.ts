import type { CurrencyCode } from '../currency/currency-code';
import type { DomainDecimalValue } from '../currency/domain-decimal';

/** One published quote: `base` priced in `quote`. Absent values stay absent. */
export interface Rate {
  readonly base: CurrencyCode;
  readonly quote: CurrencyCode;
  readonly buy?: DomainDecimalValue;
  readonly sell?: DomainDecimalValue;
  readonly cross?: DomainDecimalValue;
  readonly asOf: Date;
}

/** Every rate from one upstream fetch, with the instant the complete response arrived. */
export interface RateSnapshot {
  readonly rates: readonly Rate[];
  readonly fetchedAt: Date;
}
