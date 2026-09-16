import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CurrencyCode } from '../../currency/currency-code';
import { CurrencyMismatchError } from '../../currency/errors/currency-mismatch.error';
import { InvalidAmountError } from '../../currency/errors/invalid-amount.error';
import { InvalidRateError } from '../../currency/errors/invalid-rate.error';
import { ConversionError } from '../../conversion/errors/conversion.error';
import { UpstreamHttpError } from '../../rates/providers/errors/upstream-http.error';
import { UpstreamInvalidResponseError } from '../../rates/providers/errors/upstream-invalid-response.error';
import { UpstreamNetworkError } from '../../rates/providers/errors/upstream-network.error';
import { UpstreamRateLimitedError } from '../../rates/providers/errors/upstream-rate-limited.error';
import { UpstreamTimeoutError } from '../../rates/providers/errors/upstream-timeout.error';
import { CacheUnavailableError } from '../../rates/repository/errors/cache-unavailable.error';
import { RequestValidationError } from '../errors/request-validation.error';
import { UnsupportedMediaTypeError } from '../errors/unsupported-media-type.error';
import { mapException, type RequestFacts } from './error-envelope.mapper';

const NOW = new Date('2026-09-11T08:00:00.123Z');
const REQUEST: RequestFacts = { method: 'POST', url: '/api/convert', now: NOW };

const EUR = CurrencyCode.of('EUR');
const RUB = CurrencyCode.of('RUB');

function map(
  exception: unknown,
  request: Partial<RequestFacts> = {},
): ReturnType<typeof mapException> {
  return mapException(exception, { ...REQUEST, ...request });
}

describe('mapException', () => {
  it('builds statusCode, code, message, timestamp and path for every mapped error', () => {
    const cases: readonly [unknown, number, string, string][] = [
      [
        RequestValidationError.forField('from', 'from is required'),
        400,
        'VALIDATION_ERROR',
        'from is required',
      ],
      [
        new UnsupportedMediaTypeError(),
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'content-type must be application/json',
      ],
      [
        new ConversionError(EUR, RUB),
        422,
        'CONVERSION_ERROR',
        'no exchange rate available from EUR to RUB',
      ],
      [
        new UpstreamTimeoutError(3000),
        503,
        'UPSTREAM_UNAVAILABLE',
        'exchange rates are temporarily unavailable',
      ],
      [
        new CacheUnavailableError('read', 'failed'),
        503,
        'CACHE_UNAVAILABLE',
        'rate cache is temporarily unavailable',
      ],
      [new NotFoundException(), 404, 'NOT_FOUND', 'Cannot POST /api/convert'],
      [new Error('boom'), 500, 'INTERNAL_ERROR', 'internal server error'],
    ];
    for (const [exception, status, code, message] of cases) {
      const mapped = map(exception);

      expect(mapped.status).toBe(status);
      expect(mapped.envelope).toEqual(
        expect.objectContaining({
          statusCode: status,
          code,
          message,
          timestamp: '2026-09-11T08:00:00.123Z',
          path: '/api/convert',
        }),
      );
    }
  });

  it('answers a request validation error with its details in order', () => {
    const details = [
      { field: 'to', message: 'to is required' },
      { field: 'foo', message: 'field "foo" is not allowed' },
    ];

    const mapped = map(RequestValidationError.of(details));

    expect(mapped.envelope).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'to is required',
      details,
      timestamp: '2026-09-11T08:00:00.123Z',
      path: '/api/convert',
    });
    expect(mapped.unexpected).toBe(false);
  });

  it('gives a validation error without details a single body entry', () => {
    const mapped = map(InvalidAmountError.notPositive());

    expect(mapped.status).toBe(400);
    expect(mapped.envelope.details).toEqual([
      { field: 'body', message: 'amount must be a positive number' },
    ]);
  });

  it('maps an unknown thrown value to 500 INTERNAL_ERROR "internal server error"', () => {
    for (const thrown of [new TypeError('x is undefined'), 'text', undefined, null, { a: 1 }]) {
      const mapped = map(thrown);

      expect(mapped.status).toBe(500);
      expect(mapped.envelope.code).toBe('INTERNAL_ERROR');
      expect(mapped.envelope.message).toBe('internal server error');
      expect(mapped.unexpected).toBe(true);
    }
  });

  it('maps HTTP exceptions other than 404 to 500', () => {
    const mapped = map(new BadRequestException('Unexpected token } in JSON'));

    expect(mapped.status).toBe(500);
    expect(mapped.envelope.message).toBe('internal server error');
  });

  it('hides the message of an application error carrying INTERNAL_ERROR behind "internal server error"', () => {
    for (const error of [new InvalidRateError(0), new CurrencyMismatchError(EUR, RUB)]) {
      const mapped = map(error);

      expect(mapped.status).toBe(500);
      expect(mapped.envelope.code).toBe('INTERNAL_ERROR');
      expect(mapped.envelope.message).toBe('internal server error');
      expect(JSON.stringify(mapped.envelope)).not.toContain(error.message);
      expect(mapped.unexpected).toBe(true);
    }
  });

  it('omits details for every status other than 400 VALIDATION_ERROR', () => {
    for (const exception of [
      new UnsupportedMediaTypeError(),
      new ConversionError(EUR, RUB),
      new UpstreamRateLimitedError(),
      new CacheUnavailableError('write', 'timed out'),
      new NotFoundException(),
      new Error('boom'),
    ]) {
      expect(Object.keys(map(exception).envelope)).toEqual([
        'statusCode',
        'code',
        'message',
        'timestamp',
        'path',
      ]);
    }
  });

  it('does not expose an upstream HTTP status in the 503 message', () => {
    for (const error of [
      new UpstreamHttpError(500),
      new UpstreamRateLimitedError(),
      new UpstreamNetworkError('ECONNREFUSED'),
      new UpstreamInvalidResponseError('item 3 has no rate'),
    ]) {
      const body = JSON.stringify(map(error).envelope);

      expect(map(error).status).toBe(503);
      expect(body).not.toContain('500');
      expect(body).not.toContain('429');
      expect(body).not.toContain('Monobank');
      expect(map(error).envelope.message).toBe('exchange rates are temporarily unavailable');
    }
  });

  it('sets path without the query string', () => {
    const mapped = map(new NotFoundException(), { method: 'GET', url: '/api/nope?x=1&y=2' });

    expect(mapped.envelope.path).toBe('/api/nope');
    expect(mapped.envelope.message).toBe('Cannot GET /api/nope');
  });

  it('maps CACHE_UNAVAILABLE to 503 "rate cache is temporarily unavailable"', () => {
    const mapped = map(new CacheUnavailableError('read', 'timed out'));

    expect(mapped.status).toBe(503);
    expect(mapped.envelope.code).toBe('CACHE_UNAVAILABLE');
    expect(mapped.envelope.message).toBe('rate cache is temporarily unavailable');
    expect(mapped.unexpected).toBe(false);
  });
});
