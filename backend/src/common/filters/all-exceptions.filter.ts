import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
  type LoggerService,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { mapException } from './error-envelope.mapper';

export type ExceptionsFilterLogger = Pick<LoggerService, 'error'>;

const HEALTH_PATH = '/health';

/**
 * Global exception filter: every failure, unknown routes included, leaves as the error
 * envelope. `GET /health` keeps the health check's own 503 body. Unexpected failures are
 * logged once with their stack; the request body is never logged.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly logger: ExceptionsFilterLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const http = host.switchToHttp();
    const request: unknown = http.getRequest();
    const response: unknown = http.getResponse();
    const method = String(httpAdapter.getRequestMethod(request));
    const url = String(httpAdapter.getRequestUrl(request));

    if (isHealthCheckFailure(exception, method, url)) {
      httpAdapter.reply(response, exception.getResponse(), exception.getStatus());
      return;
    }

    const mapped = mapException(exception, { method, url, now: new Date() });
    if (mapped.unexpected) {
      this.logger.error(
        {
          event: 'http.unhandled_error',
          errorName: exception instanceof Error ? exception.name : typeof exception,
          stack: exception instanceof Error ? exception.stack : undefined,
        },
        'Unhandled error',
      );
    }
    httpAdapter.reply(response, mapped.envelope, mapped.status);
  }
}

function isHealthCheckFailure(
  exception: unknown,
  method: string,
  url: string,
): exception is HttpException {
  return (
    method === 'GET' &&
    url.split('?', 1)[0] === HEALTH_PATH &&
    exception instanceof HttpException &&
    exception.getStatus() !== 404
  );
}
