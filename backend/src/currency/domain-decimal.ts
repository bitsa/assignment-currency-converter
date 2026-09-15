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
