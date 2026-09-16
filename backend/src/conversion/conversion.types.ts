import type { CurrencyCode } from '../currency/currency-code';
import type { DomainDecimalValue } from '../currency/domain-decimal';
import type { Money } from '../currency/money';
import type { RateSource } from '../rates/rates-result.types';

export interface ConversionCommand {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  /** Already validated in `from`. */
  readonly amount: Money;
}

export interface ConversionResult {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  readonly amount: Money;
  /** Rounded half-even to the minor units of `to`. */
  readonly convertedAmount: Money;
  /** Unrounded converted amount ÷ amount, rounded half-even to 6 decimals. */
  readonly rate: DomainDecimalValue;
  readonly path: readonly CurrencyCode[];
  readonly rateDate: Date;
  readonly source: RateSource;
}

export interface CurrenciesResult {
  /** UAH and every code quoted against UAH, ascending. */
  readonly currencies: readonly CurrencyCode[];
  readonly rateDate: Date;
  readonly source: RateSource;
}
