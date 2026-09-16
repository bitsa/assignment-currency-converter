import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { AppError } from '../../common/errors/app-error';
import { CurrencyCode } from '../../currency/currency-code';
import { Money } from '../../currency/money';

/**
 * The amount rules from `Money`. The decimal-places rule needs the source currency, so it is
 * checked only when the sibling `from` is supported; otherwise only format and sign are.
 */
@ValidatorConstraint({ name: 'clientAmount' })
export class ClientAmountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    return amountProblem(value, args.object) === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    return amountProblem(args.value, args.object) ?? 'amount is invalid';
  }
}

function amountProblem(value: unknown, dto: object): string | undefined {
  const from = sourceCurrency(dto);
  try {
    if (from === undefined) {
      Money.assertClientAmountFormat(value);
    } else {
      Money.parseClientAmount(value, from);
    }
    return undefined;
  } catch (error) {
    if (error instanceof AppError) {
      return error.message;
    }
    throw error;
  }
}

function sourceCurrency(dto: object): CurrencyCode | undefined {
  try {
    return CurrencyCode.of((dto as { readonly from?: unknown }).from);
  } catch {
    return undefined;
  }
}
