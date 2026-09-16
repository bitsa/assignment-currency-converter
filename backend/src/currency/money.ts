import { Decimal } from 'decimal.js';
import type { CurrencyCode } from './currency-code';
import { DomainDecimal, MAX_RATE_DIGITS, exactTimes, guardedDiv } from './domain-decimal';
import { CurrencyMismatchError } from './errors/currency-mismatch.error';
import { InvalidAmountError } from './errors/invalid-amount.error';
import { InvalidRateError } from './errors/invalid-rate.error';
import { JsonNumber } from './json-number';

/**
 * Plain decimal notation without leading zeros. The optional `-` is accepted only so that a
 * signed amount is reported as "not positive" rather than "not a number".
 */
const PLAIN_DECIMAL = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** The JSON number grammar (RFC 8259). */
const JSON_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

export type RateValue = Decimal | string | number;

/** A finite, non-negative decimal amount in a supported currency. */
export class Money {
  readonly amount: Decimal;
  readonly currency: CurrencyCode;

  private constructor(amount: Decimal, currency: CurrencyCode) {
    this.amount = amount;
    this.currency = currency;
    Object.freeze(this);
  }

  /** Number-format and sign rules only, for when the currency is not known. */
  static assertClientAmountFormat(input: unknown): void {
    Money.readPositiveClientDecimal(input);
  }

  /** Strict edge check for a client-supplied amount; the first broken rule wins. */
  static parseClientAmount(input: unknown, currency: CurrencyCode): Money {
    const decimal = Money.readPositiveClientDecimal(input);
    if (decimal.decimalPlaces() > currency.minorUnits) {
      throw InvalidAmountError.tooManyDecimals(currency);
    }
    return new Money(decimal, currency);
  }

  /** Unrounded product, labelled with the target currency. */
  multiplyByRate(rate: RateValue, target: CurrencyCode): Money {
    return new Money(exactTimes(this.amount, Money.toRate(rate)), target);
  }

  /** Unrounded quotient, labelled with the target currency. */
  divideByRate(rate: RateValue, target: CurrencyCode): Money {
    return new Money(guardedDiv(this.amount, Money.toRate(rate)), target);
  }

  round(): Money {
    return new Money(
      this.amount.toDecimalPlaces(this.currency.minorUnits, Decimal.ROUND_HALF_EVEN),
      this.currency,
    );
  }

  compareTo(other: Money): -1 | 0 | 1 {
    if (!this.currency.equals(other.currency)) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
    const result = this.amount.cmp(other.amount);
    return result < 0 ? -1 : result > 0 ? 1 : 0;
  }

  /** Rounded half-even and rendered in fixed notation with exactly the minor units. */
  toFixed(): string {
    return this.amount.toFixed(this.currency.minorUnits, Decimal.ROUND_HALF_EVEN);
  }

  private static readPositiveClientDecimal(input: unknown): Decimal {
    const decimal = Money.readClientDecimal(input);
    if (decimal.isNeg() || decimal.isZero()) {
      throw InvalidAmountError.notPositive();
    }
    return decimal;
  }

  /**
   * A JSON number must arrive as a `JsonNumber` so its exact digits are validated; a bare
   * `number` may already have lost digits to double precision and is rejected.
   */
  private static readClientDecimal(input: unknown): Decimal {
    if (input instanceof JsonNumber) {
      if (!JSON_NUMBER.test(input.source)) {
        throw InvalidAmountError.notANumber();
      }
      const decimal = new DomainDecimal(input.source);
      if (!decimal.isFinite()) {
        throw InvalidAmountError.notANumber();
      }
      return decimal;
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!PLAIN_DECIMAL.test(trimmed)) {
        throw InvalidAmountError.notANumber();
      }
      return new DomainDecimal(trimmed);
    }
    throw InvalidAmountError.notANumber();
  }

  private static toRate(rate: RateValue): Decimal {
    let decimal: Decimal;
    try {
      decimal = new DomainDecimal(rate);
    } catch {
      throw new InvalidRateError(rate);
    }
    if (!decimal.isFinite() || !decimal.gt(0) || decimal.sd() > MAX_RATE_DIGITS) {
      throw new InvalidRateError(rate);
    }
    return decimal;
  }
}
