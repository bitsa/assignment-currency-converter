import { AppError } from './app-error';
import { RequestValidationError } from './request-validation.error';

describe('RequestValidationError', () => {
  it('uses the first details entry as the error message', () => {
    const error = RequestValidationError.of([
      { field: 'from', message: 'from is required' },
      { field: 'amount', message: 'amount must be a positive number' },
    ]);

    expect(error.message).toBe('from is required');
    expect(error.details).toEqual([
      { field: 'from', message: 'from is required' },
      { field: 'amount', message: 'amount must be a positive number' },
    ]);
  });

  it('carries code VALIDATION_ERROR and status 400', () => {
    const error = RequestValidationError.forField('to', 'to is required');

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.httpStatus).toBe(400);
    expect(error.name).toBe('RequestValidationError');
  });

  it('keeps its details frozen', () => {
    const details = [{ field: 'from', message: 'from is required' }];
    const error = RequestValidationError.of(details);
    details.push({ field: 'to', message: 'to is required' });

    expect(error.details).toHaveLength(1);
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(Object.isFrozen(error.details[0])).toBe(true);
  });

  it('refuses to be built without details', () => {
    expect(() => RequestValidationError.of([])).toThrow(RangeError);
  });

  it('reports body problems as one body entry with fixed wording', () => {
    expect(RequestValidationError.bodyNotJson().details).toEqual([
      { field: 'body', message: 'request body is not valid JSON' },
    ]);
    expect(RequestValidationError.bodyNotObject().details).toEqual([
      { field: 'body', message: 'request body must be a JSON object' },
    ]);
    expect(RequestValidationError.bodyTooLarge().details).toEqual([
      { field: 'body', message: 'request body is too large' },
    ]);
  });
});
