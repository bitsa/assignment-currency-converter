import type { CurrencyCode } from '../../currency/currency-code';
import type { DomainDecimalValue } from '../../currency/domain-decimal';
import type { Rate } from '../../rates/rate.types';

export type LegOperation = 'multiply' | 'divide';

/** One hop of a conversion: the amount in `from` is multiplied or divided by `value`. */
export interface ConversionLeg {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  /** The quote the value came from; its `asOf` dates the conversion. */
  readonly rate: Rate;
  readonly value: DomainDecimalValue;
  readonly operation: LegOperation;
}
