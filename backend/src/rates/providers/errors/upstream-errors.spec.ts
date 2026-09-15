import { AppError } from '../../../common/errors/app-error';
import { UpstreamHttpError } from './upstream-http.error';
import { UpstreamInvalidResponseError } from './upstream-invalid-response.error';
import { UpstreamNetworkError } from './upstream-network.error';
import { UpstreamRateLimitedError } from './upstream-rate-limited.error';
import { UpstreamTimeoutError } from './upstream-timeout.error';
import { UpstreamError } from './upstream.error';

describe('upstream errors', () => {
  const errors = [
    new UpstreamTimeoutError(3000),
    new UpstreamNetworkError('ECONNREFUSED'),
    new UpstreamRateLimitedError(),
    new UpstreamHttpError(502),
    new UpstreamInvalidResponseError('item 3: rateBuy must be a finite number > 0'),
  ];

  it('gives every upstream error class code UPSTREAM_UNAVAILABLE, HTTP status 503 and the UpstreamError and AppError base classes', () => {
    for (const error of errors) {
      expect(error).toBeInstanceOf(UpstreamError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(error.httpStatus).toBe(503);
    }
    expect(new UpstreamRateLimitedError()).not.toBeInstanceOf(UpstreamHttpError);
  });

  it('builds messages from the failure class and status only', () => {
    expect(errors.map((error) => [error.name, error.message])).toEqual([
      ['UpstreamTimeoutError', 'Monobank request timed out after 3000 ms'],
      ['UpstreamNetworkError', 'Monobank request failed: ECONNREFUSED'],
      ['UpstreamRateLimitedError', 'Monobank rate limit reached (HTTP 429)'],
      ['UpstreamHttpError', 'Monobank answered HTTP 502'],
      [
        'UpstreamInvalidResponseError',
        'Monobank response is invalid: item 3: rateBuy must be a finite number > 0',
      ],
    ]);
    expect(new UpstreamHttpError(502).status).toBe(502);
  });
});
