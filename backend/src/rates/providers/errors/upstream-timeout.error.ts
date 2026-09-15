import { UpstreamError } from './upstream.error';

/** No complete response arrived within the configured timeout. */
export class UpstreamTimeoutError extends UpstreamError {
  constructor(timeoutMs: number) {
    super(`Monobank request timed out after ${timeoutMs} ms`);
  }
}
