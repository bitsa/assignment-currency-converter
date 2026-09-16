import { AppError } from '../../common/errors/app-error';
import type { CurrencyCode } from '../../currency/currency-code';

/** Both codes are supported, but the current snapshot cannot convert between them. */
export class ConversionError extends AppError {
  constructor(from: CurrencyCode, to: CurrencyCode) {
    super('CONVERSION_ERROR', 422, `no exchange rate available from ${from.value} to ${to.value}`);
  }
}
