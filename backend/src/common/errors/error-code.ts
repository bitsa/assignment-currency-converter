/** Stable machine-readable error codes, as returned in the error envelope. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'CONVERSION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'UPSTREAM_UNAVAILABLE'
  | 'CACHE_UNAVAILABLE';
