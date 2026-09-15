import { Decimal } from 'decimal.js';

/**
 * Decimal constructor for every amount and rate in the domain. A private clone, so the global
 * `Decimal` defaults (precision 20, half-up) are neither relied on nor changed.
 */
export const DomainDecimal: Decimal.Constructor = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export type DomainDecimalValue = Decimal;

/** Most significant digits a rate may carry; upstream quotes have a handful. */
export const MAX_RATE_DIGITS = 20;

/** Digits a quotient keeps beyond its operands, so rounding it cannot cross a comparison. */
const QUOTIENT_GUARD_DIGITS = 40;

/**
 * Exact product at any operand size: a product never has more significant digits than its
 * operands combined, so a fixed precision could otherwise round it onto a limit.
 */
export function exactTimes(a: Decimal, b: Decimal): Decimal {
  return new DomainDecimal(withPrecision(a.sd() + b.sd()).mul(a, b));
}

/** Quotient with precision sized to its operands plus guard digits. */
export function guardedDiv(a: Decimal, b: Decimal): Decimal {
  return new DomainDecimal(withPrecision(a.sd() + b.sd() + QUOTIENT_GUARD_DIGITS).div(a, b));
}

function withPrecision(precision: number): Decimal.Constructor {
  return DomainDecimal.clone({ precision: Math.max(precision, DomainDecimal.precision) });
}
