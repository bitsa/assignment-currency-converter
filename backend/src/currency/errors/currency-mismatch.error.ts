import { AppError } from '../../common/errors/app-error';
import type { CurrencyCode } from '../currency-code';

/** A defect in the calling code: money in different currencies was combined. */
export class CurrencyMismatchError extends AppError {
  constructor(expected: CurrencyCode, actual: CurrencyCode) {
    super(
      'INTERNAL_ERROR',
      500,
      `currency mismatch: expected ${expected.value}, got ${actual.value}`,
    );
  }
}
