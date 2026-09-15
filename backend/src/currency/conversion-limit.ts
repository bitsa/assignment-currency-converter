import { CurrencyCode } from './currency-code';
import { CurrencyMismatchError } from './errors/currency-mismatch.error';
import { InvalidAmountError } from './errors/invalid-amount.error';
import { Money } from './money';

/** The most money a single conversion may move, in the currency Monobank quotes against. */
export const CONVERSION_LIMIT: Money = Money.parseClientAmount(
  '4500000.00',
  CurrencyCode.of('UAH'),
);

/** Compares an unrounded UAH value with the limit; exactly the limit passes. */
export function assertWithinConversionLimit(valueInUah: Money): void {
  if (!valueInUah.currency.equals(CONVERSION_LIMIT.currency)) {
    throw new CurrencyMismatchError(CONVERSION_LIMIT.currency, valueInUah.currency);
  }
  if (valueInUah.compareTo(CONVERSION_LIMIT) > 0) {
    throw InvalidAmountError.exceedsLimit(CONVERSION_LIMIT);
  }
}
