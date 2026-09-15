import { AppError } from '../../common/errors/app-error';
import type { CurrencyCode } from '../currency-code';
import type { Money } from '../money';

export class InvalidAmountError extends AppError {
  private constructor(message: string) {
    super('VALIDATION_ERROR', 400, message);
  }

  static notANumber(): InvalidAmountError {
    return new InvalidAmountError('amount must be a number or a numeric string');
  }

  static notPositive(): InvalidAmountError {
    return new InvalidAmountError('amount must be a positive number');
  }

  static tooManyDecimals(currency: CurrencyCode): InvalidAmountError {
    return new InvalidAmountError(
      `amount must have at most ${currency.minorUnits} decimal places for ${currency.value}`,
    );
  }

  static exceedsLimit(limit: Money): InvalidAmountError {
    return new InvalidAmountError(
      `amount exceeds the conversion limit of ${limit.toFixed()} ${limit.currency.value}`,
    );
  }
}
