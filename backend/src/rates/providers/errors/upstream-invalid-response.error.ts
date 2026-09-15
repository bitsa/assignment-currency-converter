import { UpstreamError } from './upstream.error';

/** The response body could not be turned into a usable snapshot. */
export class UpstreamInvalidResponseError extends UpstreamError {
  /** @param reason names the broken rule and item index, never a value from the body */
  constructor(reason: string) {
    super(`Monobank response is invalid: ${reason}`);
  }
}
