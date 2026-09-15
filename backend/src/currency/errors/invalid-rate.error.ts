import { AppError } from '../../common/errors/app-error';

/** A defect in the calling code: rates reaching the domain must already be valid. */
export class InvalidRateError extends AppError {
  constructor(_rate: unknown) {
    super('INTERNAL_ERROR', 500, 'rate must be a positive finite decimal');
  }
}
