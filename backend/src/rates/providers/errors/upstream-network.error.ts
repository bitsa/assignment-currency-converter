import { UpstreamError } from './upstream.error';

/** The connection failed: refused, reset or the host name did not resolve. */
export class UpstreamNetworkError extends UpstreamError {
  /** @param reason a system error code such as `ECONNREFUSED`, or `transport error` */
  constructor(reason: string) {
    super(`Monobank request failed: ${reason}`);
  }
}
