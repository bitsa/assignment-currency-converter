import { AppError } from '../../common/errors/app-error';
import { unroundedMoney } from '../../testing/money';
import { CurrencyCode } from '../currency-code';
import { CurrencyMismatchError } from './currency-mismatch.error';
import { InvalidAmountError } from './invalid-amount.error';
import { InvalidRateError } from './invalid-rate.error';
import { UnsupportedCurrencyError } from './unsupported-currency.error';

function validationErrors(): AppError[] {
  const usd = CurrencyCode.of('USD');
  return [
    new UnsupportedCurrencyError('XAU'),
    InvalidAmountError.notANumber(),
    InvalidAmountError.notPositive(),
    InvalidAmountError.tooManyDecimals(usd),
    InvalidAmountError.exceedsLimit(unroundedMoney('4500000', 'UAH')),
  ];
}

function internalErrors(): AppError[] {
  return [
    new InvalidRateError(0),
    new CurrencyMismatchError(CurrencyCode.of('UAH'), CurrencyCode.of('USD')),
  ];
}

describe('currency domain errors', () => {
  it('exposes code VALIDATION_ERROR and status 400 on UnsupportedCurrencyError and InvalidAmountError', () => {
    for (const error of validationErrors()) {
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.httpStatus).toBe(400);
    }
  });

  it('exposes code INTERNAL_ERROR and status 500 on InvalidRateError and CurrencyMismatchError', () => {
    for (const error of internalErrors()) {
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.httpStatus).toBe(500);
    }
  });

  it('makes every currency domain error an AppError', () => {
    for (const error of [...validationErrors(), ...internalErrors()]) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it('describes a currency mismatch by the expected and actual codes', () => {
    const error = new CurrencyMismatchError(CurrencyCode.of('UAH'), CurrencyCode.of('USD'));

    expect(error.message).toBe('currency mismatch: expected UAH, got USD');
  });

  it('renders any rejected currency input without throwing and without echoing a huge value', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    expect(new UnsupportedCurrencyError(cyclic).message).toBe(
      'currency [object Object] is not supported',
    );
    expect(new UnsupportedCurrencyError(Symbol('usd')).message).toBe(
      'currency Symbol(usd) is not supported',
    );
    expect(new UnsupportedCurrencyError(() => 'USD').message).toBe(
      'currency [function] is not supported',
    );

    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(new UnsupportedCurrencyError(proxy).message).toBe(
      'currency [unrenderable] is not supported',
    );

    const message = new UnsupportedCurrencyError('X'.repeat(10_000)).message;
    expect(message.length).toBeLessThan(64);
    expect(message).toContain('…');
  });
});
