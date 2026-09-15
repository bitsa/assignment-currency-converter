import { AppError } from '../../../common/errors/app-error';

/**
 * Any failure to obtain a usable rate snapshot from the upstream. Messages are fixed wording
 * built from the failure class and status only: never the body, the URL or credentials.
 */
export abstract class UpstreamError extends AppError {
  protected constructor(message: string) {
    super('UPSTREAM_UNAVAILABLE', 503, message);
  }
}
