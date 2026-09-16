import { AppError } from '../../common/errors/app-error';
import { CurrencyCode } from '../../currency/currency-code';
import { ConversionError } from './conversion.error';

describe('ConversionError', () => {
  it('carries code CONVERSION_ERROR, status 422 and a message naming both codes', () => {
    const error = new ConversionError(CurrencyCode.of('EUR'), CurrencyCode.of('RUB'));

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('CONVERSION_ERROR');
    expect(error.httpStatus).toBe(422);
    expect(error.message).toBe('no exchange rate available from EUR to RUB');
  });
});
