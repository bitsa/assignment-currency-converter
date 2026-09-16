import { ValidationError } from 'class-validator';
import { RequestValidationError } from '../errors/request-validation.error';
import { WHITELIST_CONSTRAINT, toRequestValidationError } from './validation-errors.mapper';

function validationError(property: string, constraints: Record<string, string>): ValidationError {
  const error = new ValidationError();
  error.property = property;
  error.constraints = constraints;
  error.children = [];
  return error;
}

function unknownField(property: string): ValidationError {
  return validationError(property, {
    [WHITELIST_CONSTRAINT]: `property ${property} should not exist`,
  });
}

describe('toRequestValidationError', () => {
  it('orders details from, to, amount, then unknown fields in body order', () => {
    const error = toRequestValidationError([
      unknownField('zeta'),
      unknownField('alpha'),
      validationError('from', { isDefined: 'from is required' }),
      validationError('to', { supportedCurrency: 'currency "XAU" is not supported' }),
      validationError('amount', { clientAmount: 'amount must be a positive number' }),
    ]);

    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error.details).toEqual([
      { field: 'from', message: 'from is required' },
      { field: 'to', message: 'currency "XAU" is not supported' },
      { field: 'amount', message: 'amount must be a positive number' },
      { field: 'zeta', message: 'field "zeta" is not allowed' },
      { field: 'alpha', message: 'field "alpha" is not allowed' },
    ]);
    expect(error.message).toBe('from is required');
  });

  it('reports only the first constraint message of a property', () => {
    const error = toRequestValidationError([
      validationError('amount', { first: 'first message', second: 'second message' }),
    ]);

    expect(error.details).toEqual([{ field: 'amount', message: 'first message' }]);
  });

  it('quotes an unknown field name as sent', () => {
    const error = toRequestValidationError([unknownField('rate"Type')]);

    expect(error.message).toBe('field "rate\\"Type" is not allowed');
  });
});
