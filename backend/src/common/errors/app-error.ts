import type { ErrorCode } from './error-code';

/** Base class for every error the application throws on purpose. */
export abstract class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  protected constructor(code: ErrorCode, httpStatus: number, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
