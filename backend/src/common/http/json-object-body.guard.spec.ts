import type { ExecutionContext } from '@nestjs/common';
import { JsonNumber } from '../../currency/json-number';
import { thrownBy } from '../../testing/thrown-by';
import { RequestValidationError } from '../errors/request-validation.error';
import { UnsupportedMediaTypeError } from '../errors/unsupported-media-type.error';
import { JsonObjectBodyGuard } from './json-object-body.guard';

/** `parsed` holds the body when the parser read one; omit it for a body never read. */
function contextFor(contentType: string | undefined, parsed?: { body: unknown }): ExecutionContext {
  const headers: Record<string, string> = {};
  if (contentType !== undefined) {
    headers['content-type'] = contentType;
  }
  const request = { headers, ...parsed };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext; // only switchToHttp().getRequest() is used by the guard
}

function check(contentType: string | undefined, parsed?: { body: unknown }): unknown {
  return thrownBy(() => new JsonObjectBodyGuard().canActivate(contextFor(contentType, parsed)));
}

function bodyMessage(error: unknown): string | undefined {
  return error instanceof RequestValidationError ? error.message : undefined;
}

describe('JsonObjectBodyGuard', () => {
  it('lets a JSON object body through', () => {
    const context = contextFor('application/json; charset=utf-8', { body: { from: 'EUR' } });

    expect(new JsonObjectBodyGuard().canActivate(context)).toBe(true);
  });

  it('rejects text/plain, form-urlencoded and a missing content type with 415', () => {
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', undefined]) {
      expect(check(contentType, { body: { from: 'EUR' } })).toBeInstanceOf(
        UnsupportedMediaTypeError,
      );
    }
  });

  it('reports a body that was never read as not valid JSON', () => {
    expect(bodyMessage(check('application/json'))).toBe('request body is not valid JSON');
  });

  it('rejects an array, a string, null and a bare number as not a JSON object', () => {
    for (const body of [[], 'EUR', null, new JsonNumber('42'), Object.create(null)]) {
      expect(bodyMessage(check('application/json', { body }))).toBe(
        'request body must be a JSON object',
      );
    }
  });
});
