import { AppError } from './app-error';
import type { FieldError } from './field-error.types';

/** A request the API refuses to process; carries one entry per broken field. */
export class RequestValidationError extends AppError {
  readonly details: readonly FieldError[];

  private constructor(details: readonly FieldError[]) {
    const [first] = details;
    if (first === undefined) {
      throw new RangeError('RequestValidationError needs at least one detail');
    }
    super('VALIDATION_ERROR', 400, first.message);
    this.details = Object.freeze(
      details.map((detail) => Object.freeze({ field: detail.field, message: detail.message })),
    );
  }

  static of(details: readonly FieldError[]): RequestValidationError {
    return new RequestValidationError(details);
  }

  static forField(field: string, message: string): RequestValidationError {
    return new RequestValidationError([{ field, message }]);
  }

  static bodyNotJson(): RequestValidationError {
    return RequestValidationError.forField('body', 'request body is not valid JSON');
  }

  static bodyNotObject(): RequestValidationError {
    return RequestValidationError.forField('body', 'request body must be a JSON object');
  }

  static bodyTooLarge(): RequestValidationError {
    return RequestValidationError.forField('body', 'request body is too large');
  }
}
