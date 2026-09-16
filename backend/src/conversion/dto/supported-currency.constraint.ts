import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { CurrencyCode } from '../../currency/currency-code';
import { UnsupportedCurrencyError } from '../../currency/errors/unsupported-currency.error';

/** The value is a code `CurrencyCode.of` accepts (any case, surrounding spaces allowed). */
@ValidatorConstraint({ name: 'supportedCurrency' })
export class SupportedCurrencyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isSupportedCurrency(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return new UnsupportedCurrencyError(args.value).message;
  }
}

export function isSupportedCurrency(value: unknown): boolean {
  try {
    CurrencyCode.of(value);
    return true;
  } catch {
    return false;
  }
}
