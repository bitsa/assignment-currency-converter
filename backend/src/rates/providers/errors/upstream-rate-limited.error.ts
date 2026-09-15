import { UpstreamError } from './upstream.error';

/** The upstream answered 429. */
export class UpstreamRateLimitedError extends UpstreamError {
  constructor() {
    super('Monobank rate limit reached (HTTP 429)');
  }
}
