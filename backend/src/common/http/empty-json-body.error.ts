import { AppError } from '../errors/app-error';

/**
 * Thrown from the JSON parser's `verify` hook for a zero-length body, which body-parser would
 * otherwise parse as `{}`. `type` follows body-parser's error convention, so the parser error
 * middleware can recognise it.
 */
export class EmptyJsonBodyError extends AppError {
  readonly type = 'entity.empty';

  constructor() {
    super('VALIDATION_ERROR', 400, 'request body is not valid JSON');
  }
}
