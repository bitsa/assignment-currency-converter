import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { RequestValidationError } from '../errors/request-validation.error';
import { UnsupportedMediaTypeError } from '../errors/unsupported-media-type.error';
import { hadEmptyJsonBody } from './json-body-parser';
import { isJsonMediaType } from './json-media-type';

type ParsedRequest = IncomingMessage & { readonly body?: unknown };

/**
 * Runs before the validation pipe: the request must be JSON and its body a JSON object. The
 * pipe would otherwise turn a `null` body into `{}` and report every field as missing.
 */
@Injectable()
export class JsonObjectBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ParsedRequest>();
    if (!isJsonMediaType(request.headers['content-type'])) {
      throw new UnsupportedMediaTypeError();
    }
    // A request with neither content-length nor transfer-encoding is never read; an empty one is
    // read but parsed as `{}`.
    if (request.body === undefined || hadEmptyJsonBody(request)) {
      throw RequestValidationError.bodyNotJson();
    }
    if (!isPlainObject(request.body)) {
      throw RequestValidationError.bodyNotObject();
    }
    return true;
  }
}

function isPlainObject(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}
