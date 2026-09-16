import { HttpException, HttpStatus } from '@nestjs/common';
import { AppError } from '../errors/app-error';
import type { ErrorCode } from '../errors/error-code';
import type { FieldError } from '../errors/field-error.types';
import { RequestValidationError } from '../errors/request-validation.error';
import type { ErrorEnvelope } from './error-envelope.types';

export interface MappedError {
  readonly status: number;
  readonly envelope: ErrorEnvelope;
  /** True for a `500`: the failure was not anticipated and is logged. */
  readonly unexpected: boolean;
}

export interface RequestFacts {
  readonly method: string;
  /** May carry a query string. */
  readonly url: string;
  readonly now: Date;
}

interface Outcome {
  readonly status: number;
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: readonly FieldError[];
}

const INTERNAL: Outcome = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  code: 'INTERNAL_ERROR',
  message: 'internal server error',
};

/**
 * Pure mapping from anything thrown to the response. Only validation and conversion errors
 * pass their own message to the client; every other message is fixed wording.
 */
export function mapException(exception: unknown, request: RequestFacts): MappedError {
  const path = pathOf(request.url);
  const outcome = outcomeOf(exception, request.method, path);
  const envelope: ErrorEnvelope = {
    statusCode: outcome.status,
    code: outcome.code,
    message: outcome.message,
    ...(outcome.details === undefined ? {} : { details: outcome.details }),
    timestamp: request.now.toISOString(),
    path,
  };
  return { status: outcome.status, envelope, unexpected: outcome === INTERNAL };
}

function outcomeOf(exception: unknown, method: string, path: string): Outcome {
  if (exception instanceof RequestValidationError) {
    return validation(exception.details);
  }
  if (exception instanceof AppError) {
    return appErrorOutcome(exception);
  }
  if (exception instanceof HttpException && exception.getStatus() === 404) {
    return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: `Cannot ${method} ${path}` };
  }
  return INTERNAL;
}

function appErrorOutcome(error: AppError): Outcome {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return validation([{ field: 'body', message: error.message }]);
    case 'UNSUPPORTED_MEDIA_TYPE':
      return {
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        code: error.code,
        message: 'content-type must be application/json',
      };
    case 'CONVERSION_ERROR':
      return { status: HttpStatus.UNPROCESSABLE_ENTITY, code: error.code, message: error.message };
    case 'UPSTREAM_UNAVAILABLE':
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: error.code,
        message: 'exchange rates are temporarily unavailable',
      };
    case 'CACHE_UNAVAILABLE':
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: error.code,
        message: 'rate cache is temporarily unavailable',
      };
    default:
      return INTERNAL;
  }
}

function validation(details: readonly FieldError[]): Outcome {
  const [first] = details;
  return {
    status: HttpStatus.BAD_REQUEST,
    code: 'VALIDATION_ERROR',
    message: first?.message ?? 'request is invalid',
    details,
  };
}

function pathOf(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}
