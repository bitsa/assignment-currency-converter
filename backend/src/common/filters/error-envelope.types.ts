import type { ErrorCode } from '../errors/error-code';
import type { FieldError } from '../errors/field-error.types';

/** The body of every non-2xx response except `GET /health`. */
export interface ErrorEnvelope {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly message: string;
  /** Only on `400 VALIDATION_ERROR`. */
  readonly details?: readonly FieldError[];
  /** ISO 8601 UTC with milliseconds. */
  readonly timestamp: string;
  /** The request path without the query string. */
  readonly path: string;
}
