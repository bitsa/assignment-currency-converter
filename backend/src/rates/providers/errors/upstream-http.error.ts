import { UpstreamError } from './upstream.error';

/** The upstream answered a status outside 200–299 other than 429. */
export class UpstreamHttpError extends UpstreamError {
  readonly status: number;

  constructor(status: number) {
    super(`Monobank answered HTTP ${status}`);
    this.status = status;
  }
}
