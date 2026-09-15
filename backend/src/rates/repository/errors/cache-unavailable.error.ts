import { AppError } from '../../../common/errors/app-error';

export type CacheOperation = 'read' | 'write' | 'delete';
export type CacheFailure = 'failed' | 'timed out';

/**
 * A cache store operation failed or got no reply in time. Fixed wording built from the operation
 * and failure kind only: never the Redis error text, the stored value or the connection URL.
 */
export class CacheUnavailableError extends AppError {
  readonly operation: CacheOperation;

  constructor(operation: CacheOperation, failure: CacheFailure) {
    super('CACHE_UNAVAILABLE', 503, `Redis ${operation} ${failure}`);
    this.operation = operation;
  }
}

/** Log-safe reason for a failed repository call: never `String(error)`, which may hold a URL. */
export function cacheErrorReason(error: unknown): string {
  return error instanceof CacheUnavailableError ? error.message : 'repository failure';
}
