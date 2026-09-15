import type { CurrencyCode } from '../currency/currency-code';
import {
  DomainDecimal,
  MAX_RATE_DIGITS,
  type DomainDecimalValue,
} from '../currency/domain-decimal';
import { InvalidRateError } from '../currency/errors/invalid-rate.error';
import type { Rate } from './rate.types';

export interface RateInput {
  readonly base: CurrencyCode;
  readonly quote: CurrencyCode;
  readonly buy?: DomainDecimalValue;
  readonly sell?: DomainDecimalValue;
  readonly cross?: DomainDecimalValue;
  readonly asOf: Date;
}

const VALUE_KEYS = ['buy', 'sell', 'cross'] as const;

/** Frozen Rate with only the present value keys; throws InvalidRateError on a defect. */
export function createRate(input: RateInput): Rate {
  if (input.base.equals(input.quote) || Number.isNaN(input.asOf.getTime())) {
    throw new InvalidRateError(input);
  }
  const values: {
    buy?: DomainDecimalValue;
    sell?: DomainDecimalValue;
    cross?: DomainDecimalValue;
  } = {};
  for (const key of VALUE_KEYS) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (!isValidRateValue(value)) {
      throw new InvalidRateError(value);
    }
    values[key] = value;
  }
  if (Object.keys(values).length === 0) {
    throw new InvalidRateError(input);
  }
  return Object.freeze({
    base: input.base,
    quote: input.quote,
    ...values,
    asOf: new Date(input.asOf.getTime()),
  });
}

function isValidRateValue(value: DomainDecimalValue): boolean {
  return (
    value instanceof DomainDecimal &&
    value.isFinite() &&
    value.gt(0) &&
    value.sd() <= MAX_RATE_DIGITS
  );
}
