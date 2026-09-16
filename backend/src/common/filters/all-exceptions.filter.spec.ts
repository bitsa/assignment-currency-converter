import { ServiceUnavailableException, type ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { UpstreamTimeoutError } from '../../rates/providers/errors/upstream-timeout.error';
import { RequestValidationError } from '../errors/request-validation.error';
import { AllExceptionsFilter, type ExceptionsFilterLogger } from './all-exceptions.filter';

interface FakeRequest {
  readonly method: string;
  readonly url: string;
}

const RESPONSE = { fake: 'response' };

function setup(): {
  readonly filter: AllExceptionsFilter;
  readonly reply: jest.Mock<void, [unknown, unknown, number]>;
  readonly error: jest.Mock<void, [unknown, ...unknown[]]>;
} {
  const reply = jest.fn<void, [unknown, unknown, number]>();
  const error = jest.fn<void, [unknown, ...unknown[]]>();
  const adapterHost = {
    httpAdapter: {
      getRequestMethod: (request: FakeRequest) => request.method,
      getRequestUrl: (request: FakeRequest) => request.url,
      reply,
    },
  } as unknown as HttpAdapterHost; // only the three adapter methods above are used
  const logger: ExceptionsFilterLogger = { error };
  return { filter: new AllExceptionsFilter(adapterHost, logger), reply, error };
}

function hostFor(method: string, url: string): ArgumentsHost {
  const request: FakeRequest = { method, url };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => RESPONSE }),
  } as unknown as ArgumentsHost; // only switchToHttp() is used by the filter
}

describe('AllExceptionsFilter', () => {
  it('replies with the envelope and its status', () => {
    const { filter, reply } = setup();

    filter.catch(new UpstreamTimeoutError(3000), hostFor('POST', '/api/convert?x=1'));

    expect(reply).toHaveBeenCalledWith(
      RESPONSE,
      expect.objectContaining({
        statusCode: 503,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'exchange rates are temporarily unavailable',
        path: '/api/convert',
      }),
      503,
    );
  });

  it('logs http.unhandled_error only for unexpected errors', () => {
    const { filter, error } = setup();
    const boom = new TypeError('cannot read x');

    filter.catch(RequestValidationError.bodyNotJson(), hostFor('POST', '/api/convert'));
    filter.catch(new UpstreamTimeoutError(3000), hostFor('POST', '/api/convert'));
    expect(error).not.toHaveBeenCalled();

    filter.catch(boom, hostFor('POST', '/api/convert'));
    filter.catch('thrown text', hostFor('GET', '/api/currencies'));

    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenNthCalledWith(
      1,
      { event: 'http.unhandled_error', errorName: 'TypeError', stack: boom.stack },
      'Unhandled error',
    );
    expect(error).toHaveBeenNthCalledWith(
      2,
      { event: 'http.unhandled_error', errorName: 'string', stack: undefined },
      'Unhandled error',
    );
  });

  it("answers GET /health with the health check's own 503 body and status, not the envelope", () => {
    const { filter, reply, error } = setup();
    const healthBody = { status: 'error', info: {}, error: { redis: { status: 'down' } } };

    filter.catch(new ServiceUnavailableException(healthBody), hostFor('GET', '/health'));

    expect(reply).toHaveBeenCalledWith(RESPONSE, healthBody, 503);
    expect(error).not.toHaveBeenCalled();
  });

  it('answers an unexpected error on GET /health with the 500 envelope', () => {
    const { filter, reply } = setup();

    filter.catch(new Error('boom'), hostFor('GET', '/health'));

    expect(reply).toHaveBeenCalledWith(
      RESPONSE,
      expect.objectContaining({ code: 'INTERNAL_ERROR', path: '/health' }),
      500,
    );
  });
});
