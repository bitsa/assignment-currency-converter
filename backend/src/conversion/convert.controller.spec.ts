import request, { type Response } from 'supertest';
import { AppConfigService } from '../config/app-config.service';
import { UpstreamHttpError } from '../rates/providers/errors/upstream-http.error';
import { UpstreamInvalidResponseError } from '../rates/providers/errors/upstream-invalid-response.error';
import { UpstreamNetworkError } from '../rates/providers/errors/upstream-network.error';
import { UpstreamRateLimitedError } from '../rates/providers/errors/upstream-rate-limited.error';
import { UpstreamTimeoutError } from '../rates/providers/errors/upstream-timeout.error';
import type { RateProvider } from '../rates/providers/rate-provider.interface';
import type { RateSnapshot } from '../rates/rate.types';
import { RATES_CACHE_KEY } from '../rates/repository/redis-rates.repository';
import { FakeRedisCommands } from '../testing/fake-redis-commands';
import { defaultFixtureSnapshot, fixtureQuotesWith, snapshotOf } from '../testing/rate-snapshots';
import { createTestApp, type TestApp } from '../testing/test-app';

interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly details?: readonly { readonly field: string; readonly message: string }[];
  readonly timestamp: string;
  readonly path: string;
}

interface ConvertBody {
  readonly from: unknown;
  readonly to: unknown;
  readonly amount: unknown;
  readonly convertedAmount: unknown;
  readonly rate: unknown;
  readonly path: unknown;
  readonly rateDate: unknown;
  readonly source: unknown;
}

interface CurrenciesBody {
  readonly currencies: readonly string[];
  readonly rateDate: string;
  readonly source: string;
}

interface OpenApiDocument {
  readonly paths: Record<
    string,
    Record<
      string,
      {
        readonly requestBody?: {
          readonly content: Record<string, { readonly schema: { readonly $ref?: string } }>;
        };
        readonly responses: Record<string, unknown>;
      }
    >
  >;
  readonly components: {
    readonly schemas: Record<
      string,
      { readonly properties?: Record<string, { readonly example?: unknown }> }
    >;
  };
}

const EUR_TO_GBP = '{"from":"EUR","to":"GBP","amount":100}';
const JSON_TYPE = 'application/json';

/** Resolves `getRates` with a fresh copy of `snapshot()` stamped with the current time. */
class FakeRateProvider implements RateProvider {
  snapshot: (fetchedAt: Date) => RateSnapshot = defaultFixtureSnapshot;
  readonly getRates = jest.fn<Promise<RateSnapshot>, []>(() =>
    Promise.resolve(this.snapshot(new Date(Date.now()))),
  );
}

describe('ConvertController over HTTP', () => {
  let testApp: TestApp;
  let provider: FakeRateProvider;
  let redis: FakeRedisCommands;

  beforeEach(async () => {
    provider = new FakeRateProvider();
    redis = new FakeRedisCommands();
    testApp = await createTestApp({ rateProvider: provider });
    testApp.redis.get.mockImplementation((key) => redis.get(key));
    testApp.redis.set.mockImplementation((key, value, token, seconds) =>
      redis.set(key, value, token, seconds),
    );
    testApp.redis.del.mockImplementation((key) => redis.del(key));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await testApp.app.close();
  });

  function agent(): ReturnType<typeof request> {
    return request(testApp.app.getHttpServer());
  }

  function post(body: string, contentType = JSON_TYPE): request.Test {
    return agent().post('/api/convert').set('content-type', contentType).send(body);
  }

  function convert(from: string, to: string, amount: string): request.Test {
    return post(`{"from":${JSON.stringify(from)},"to":${JSON.stringify(to)},"amount":${amount}}`);
  }

  function currencies(): request.Test {
    return agent().get('/api/currencies');
  }

  function errorOf(response: Response): ErrorBody {
    return response.body as ErrorBody;
  }

  function successOf(response: Response): ConvertBody {
    expect(response.status).toBe(200);
    return response.body as ConvertBody;
  }

  async function settled(pending: request.Test): Promise<Response> {
    const response = await pending;
    await new Promise((resolve) => setImmediate(resolve));
    return response;
  }

  function expectValidationError(response: Response, message: string): void {
    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    expect(errorOf(response).message).toBe(message);
  }

  function expectUpstreamUnavailable(response: Response, path = '/api/convert'): void {
    expect(response.status).toBe(503);
    expect(errorOf(response)).toEqual({
      statusCode: 503,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'exchange rates are temporarily unavailable',
      timestamp: expect.any(String),
      path,
    });
  }

  function ageBy(milliseconds: number): void {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + milliseconds);
  }

  function cacheTtlSeconds(): number {
    return testApp.app.get(AppConfigService).ratesCacheTtlSeconds;
  }

  describe('POST /api/convert', () => {
    it('converts 100 EUR to GBP via UAH to 86.46 at rate 0.864621', async () => {
      const body = successOf(await post(EUR_TO_GBP));

      expect(body).toEqual(
        expect.objectContaining({
          convertedAmount: 86.46,
          rate: 0.864621,
          path: ['EUR', 'UAH', 'GBP'],
        }),
      );
    });

    it('returns exactly from, to, amount, convertedAmount, rate, path, rateDate and source on success', async () => {
      const body = successOf(await post(EUR_TO_GBP));

      expect(body).toEqual({
        from: 'EUR',
        to: 'GBP',
        amount: 100,
        convertedAmount: 86.46,
        rate: 0.864621,
        path: ['EUR', 'UAH', 'GBP'],
        rateDate: '2026-09-11T05:00:00.000Z',
        source: 'live',
      });
    });

    it('returns amount, convertedAmount and rate as JSON numbers and the other fields as strings', async () => {
      const body = successOf(await convert('EUR', 'UAH', '"100.50"'));

      expect(typeof body.amount).toBe('number');
      expect(typeof body.convertedAmount).toBe('number');
      expect(typeof body.rate).toBe('number');
      expect(typeof body.from).toBe('string');
      expect(typeof body.to).toBe('string');
      expect(typeof body.rateDate).toBe('string');
      expect(typeof body.source).toBe('string');
    });

    it('converts EUR to EUR at rate 1 with path [EUR] and the same amount', async () => {
      const body = successOf(await convert('EUR', 'EUR', '100'));

      expect(body).toEqual(
        expect.objectContaining({ amount: 100, convertedAmount: 100, rate: 1, path: ['EUR'] }),
      );
    });

    it('accepts lower-case and space-padded codes and returns them upper-case', async () => {
      const body = successOf(await convert(' eur ', 'gbp', '100'));

      expect([body.from, body.to, body.convertedAmount]).toEqual(['EUR', 'GBP', 86.46]);
    });

    it('accepts "100.50" as the amount and returns amount 100.5 and convertedAmount 4813.95', async () => {
      const body = successOf(await convert('EUR', 'UAH', '"100.50"'));

      expect([body.amount, body.convertedAmount]).toEqual([100.5, 4813.95]);
    });

    it('accepts a JSON number in exponent form 1e2 and returns amount 100', async () => {
      const body = successOf(await convert('EUR', 'UAH', '1e2'));

      expect([body.amount, body.convertedAmount]).toEqual([100, 4790]);
    });

    it('rejects a raw JSON body amount 0.100000000000000005 for USD with the decimal-places message', async () => {
      const response = await convert('USD', 'EUR', '0.100000000000000005');

      expectValidationError(response, 'amount must have at most 2 decimal places for USD');
      expect(errorOf(response).details).toEqual([
        { field: 'amount', message: 'amount must have at most 2 decimal places for USD' },
      ]);
    });

    it('answers several invalid fields with one details entry each, in order', async () => {
      const response = await post('{"foo":1,"amount":"-5","to":"XAU"}');

      expect(errorOf(response)).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'from is required',
        details: [
          { field: 'from', message: 'from is required' },
          { field: 'to', message: 'currency "XAU" is not supported' },
          { field: 'amount', message: 'amount must be a positive number' },
          { field: 'foo', message: 'field "foo" is not allowed' },
        ],
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        path: '/api/convert',
      });
    });

    it('does not call the rate provider when a request fails validation', async () => {
      await post('{"from":"EUR","to":"XAU","amount":99999999}').expect(400);
      await post('{"from":"EUR","to":"GBP","amount":100,"rateType":"bank"}').expect(400);

      expect(provider.getRates).not.toHaveBeenCalled();
      expect(testApp.redis.get).not.toHaveBeenCalled();
    });

    it('answers a limit rejection with 400 and one details entry for amount', async () => {
      const response = await convert('USD', 'EUR', '109489.06');

      expectValidationError(response, 'amount exceeds the conversion limit of 4500000.00 UAH');
      expect(errorOf(response).details).toEqual([
        { field: 'amount', message: 'amount exceeds the conversion limit of 4500000.00 UAH' },
      ]);
    });

    it('answers EUR to RUB with 422 CONVERSION_ERROR "no exchange rate available from EUR to RUB"', async () => {
      const response = await convert('EUR', 'RUB', '100');

      expect(response.status).toBe(422);
      expect(errorOf(response)).toEqual({
        statusCode: 422,
        code: 'CONVERSION_ERROR',
        message: 'no exchange rate available from EUR to RUB',
        timestamp: expect.any(String),
        path: '/api/convert',
      });
    });

    it('ignores __proto__ and constructor keys in the body and converts normally', async () => {
      const response = await post(
        '{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}},"from":"EUR","to":"GBP","amount":100}',
      );

      expect(successOf(response).convertedAmount).toBe(86.46);
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('answers an unknown field named hasOwnProperty with 400 "field \\"hasOwnProperty\\" is not allowed"', async () => {
      const response = await post('{"from":"EUR","to":"GBP","amount":100,"hasOwnProperty":1}');

      expectValidationError(response, 'field "hasOwnProperty" is not allowed');
      expect(provider.getRates).not.toHaveBeenCalled();
    });

    it('ignores constructor and prototype keys whatever their value', async () => {
      for (const value of ['1', 'null', 'false', '""', '0', '{}']) {
        for (const key of ['constructor', 'prototype', '__proto__']) {
          const response = await post(
            `{"from":"EUR","to":"GBP","amount":100,${JSON.stringify(key)}:${value}}`,
          );

          expect([key, value, response.status]).toEqual([key, value, 200]);
        }
      }
    });

    it('does not echo the value of an unknown field in the error body', async () => {
      const secret = 'S'.repeat(1024);

      const response = await settled(
        post(`{"from":"EUR","to":"GBP","amount":100,"note":"${secret}"}`),
      );

      expectValidationError(response, 'field "note" is not allowed');
      expect(response.text).not.toContain('SSSS');
      expect(testApp.rawLogLines().join('\n')).not.toContain('SSSS');
    });
  });

  describe('request body', () => {
    it('answers POST /api/convert without a JSON content type with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const noContentType = agent().post('/api/convert');
      const responses = [
        await post(EUR_TO_GBP, 'text/plain'),
        await post('from=EUR&to=GBP&amount=100', 'application/x-www-form-urlencoded'),
        await post(EUR_TO_GBP, 'application/problem+json'),
        await noContentType,
      ];

      expect(noContentType.get('content-type')).toBeUndefined();
      for (const response of responses) {
        expect(response.status).toBe(415);
        expect(errorOf(response)).toEqual({
          statusCode: 415,
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'content-type must be application/json',
          timestamp: expect.any(String),
          path: '/api/convert',
        });
      }
    });

    it('converts a request sent as Application/JSON; charset=utf-8', async () => {
      const response = await post(EUR_TO_GBP, 'Application/JSON; charset=utf-8');

      expect(successOf(response).convertedAmount).toBe(86.46);
    });

    it('answers a JSON body in an unsupported charset with 400 "request body is not valid JSON"', async () => {
      const response = await post(EUR_TO_GBP, 'application/json; charset=utf-16');

      expectValidationError(response, 'request body is not valid JSON');
    });

    it('answers a malformed JSON body with 400 "request body is not valid JSON"', async () => {
      const response = await post('{"from":');

      expectValidationError(response, 'request body is not valid JSON');
      expect(errorOf(response).details).toEqual([
        { field: 'body', message: 'request body is not valid JSON' },
      ]);
      expect(response.text).not.toContain('Unexpected');
    });

    it('answers [], "EUR", null and 42 bodies with 400 "request body must be a JSON object"', async () => {
      for (const body of ['[]', '"EUR"', 'null', '42']) {
        const response = await post(body);

        expectValidationError(response, 'request body must be a JSON object');
        expect(errorOf(response).details).toEqual([
          { field: 'body', message: 'request body must be a JSON object' },
        ]);
      }
    });

    it('answers a body over 16 KiB with 400 "request body is too large"', async () => {
      const padded = (bytes: number): string => {
        const head = '{"from":"EUR","to":"GBP","amount":100,"pad":"';
        const tail = '"}';
        return head + 'x'.repeat(bytes - head.length - tail.length) + tail;
      };

      const tooLarge = await post(padded(16385));
      const atLimit = await post(padded(16384));

      expectValidationError(tooLarge, 'request body is too large');
      expect(errorOf(tooLarge).details).toEqual([
        { field: 'body', message: 'request body is too large' },
      ]);
      expectValidationError(atLimit, 'field "pad" is not allowed');
    });

    it('answers an empty JSON body with 400 and a single body entry "request body is not valid JSON"', async () => {
      const withLength = await agent()
        .post('/api/convert')
        .set('content-type', JSON_TYPE)
        .set('content-length', '0')
        .send();
      const withoutLength = await agent().post('/api/convert').set('content-type', JSON_TYPE);

      for (const response of [withLength, withoutLength]) {
        expectValidationError(response, 'request body is not valid JSON');
        expect(errorOf(response).details).toEqual([
          { field: 'body', message: 'request body is not valid JSON' },
        ]);
      }
    });

    it('sets the envelope path without the query string', async () => {
      const response = await agent()
        .post('/api/convert?x=1')
        .set('content-type', JSON_TYPE)
        .send('{"from":');

      expect(errorOf(response).path).toBe('/api/convert');
    });
  });

  describe('GET /api/currencies', () => {
    it('answers a GET with a JSON content type and an empty body like any other GET', async () => {
      const response = await agent()
        .get('/api/currencies')
        .set('content-type', JSON_TYPE)
        .set('content-length', '0');

      expect(response.status).toBe(200);
      expect((response.body as CurrenciesBody).currencies).toContain('UAH');
    });

    it('answers GET /api/currencies with the eight default-fixture codes', async () => {
      const response = await currencies();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        currencies: ['CHF', 'CZK', 'EUR', 'GBP', 'JPY', 'PLN', 'UAH', 'USD'],
        rateDate: '2026-09-11T05:00:00.000Z',
        source: 'live',
      });
    });

    it('reports source live then cache for two currency requests within the cache TTL', async () => {
      const first = (await currencies()).body as CurrenciesBody;
      const second = (await currencies()).body as CurrenciesBody;

      expect([first.source, second.source]).toEqual(['live', 'cache']);
      expect(provider.getRates).toHaveBeenCalledTimes(1);
    });

    it('answers GET /api/currencies with 503 UPSTREAM_UNAVAILABLE when rates cannot be served', async () => {
      provider.getRates.mockRejectedValue(new UpstreamHttpError(500));

      expectUpstreamUnavailable(await currencies(), '/api/currencies');
    });
  });

  describe('upstream failures', () => {
    it('answers 503 UPSTREAM_UNAVAILABLE with the fixed message for every upstream error class', async () => {
      for (const error of [
        new UpstreamHttpError(500),
        new UpstreamRateLimitedError(),
        new UpstreamInvalidResponseError('body is not a JSON array'),
        new UpstreamInvalidResponseError('no usable item'),
        new UpstreamNetworkError('ECONNREFUSED'),
      ]) {
        provider.getRates.mockRejectedValueOnce(error);

        const response = await post(EUR_TO_GBP);

        expectUpstreamUnavailable(response);
        expect(response.text).not.toContain('Monobank');
      }
    });

    it('answers 503 UPSTREAM_UNAVAILABLE when the provider times out', async () => {
      provider.getRates.mockRejectedValue(new UpstreamTimeoutError(3000));

      expectUpstreamUnavailable(await post(EUR_TO_GBP));
    });

    it('answers 503 rather than 400 when rates cannot be served and the amount is over the limit', async () => {
      provider.getRates.mockRejectedValue(new UpstreamHttpError(500));

      expectUpstreamUnavailable(await convert('UAH', 'EUR', '4500000.01'));
    });

    it('answers live after a failed conversion once the provider recovers', async () => {
      provider.getRates.mockRejectedValueOnce(new UpstreamHttpError(500));

      const failed = await post(EUR_TO_GBP);
      const recovered = await post(EUR_TO_GBP);

      expect(failed.status).toBe(503);
      expect(successOf(recovered).source).toBe('live');
      expect(redis.valueOf(RATES_CACHE_KEY)).toBeDefined();
    });

    it('answers 500 INTERNAL_ERROR when the provider throws an unexpected error', async () => {
      provider.getRates.mockRejectedValue(new TypeError('cannot read rates of undefined'));

      const response = await post(EUR_TO_GBP);

      expect(response.status).toBe(500);
      expect(errorOf(response)).toEqual({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'internal server error',
        timestamp: expect.any(String),
        path: '/api/convert',
      });
    });

    it('returns a 500 body without a stack field or file paths', async () => {
      provider.getRates.mockRejectedValue(new Error('failed in /app/dist/rates/rates.service.js'));

      const response = await post(EUR_TO_GBP);

      expect(response.status).toBe(500);
      expect(response.body).not.toHaveProperty('stack');
      expect(response.text).not.toMatch(/\.(ts|js)\b|\/app\/|\bat /);
    });

    it('logs one error line http.unhandled_error with errorName and stack for a 500', async () => {
      const failure = new TypeError('cannot read rates of undefined');
      provider.getRates.mockRejectedValue(failure);

      await settled(post('{"from":"EUR","to":"GBP","amount":"77.77"}'));
      const lines = testApp.logLines().filter((line) => line['event'] === 'http.unhandled_error');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toEqual(
        expect.objectContaining({
          level: 'error',
          errorName: 'TypeError',
          stack: failure.stack,
          msg: 'Unhandled error',
        }),
      );
      expect(typeof lines[0]?.reqId).toBe('string');
      expect(testApp.rawLogLines().join('\n')).not.toContain('77.77');
    });

    it('writes no http.unhandled_error line for a 4xx or 503', async () => {
      provider.getRates.mockRejectedValue(new UpstreamHttpError(500));

      await settled(post('{"from":'));
      await settled(post(EUR_TO_GBP));

      expect(testApp.logLines().filter((line) => line['event'] === 'http.unhandled_error')).toEqual(
        [],
      );
    });
  });

  describe('rates cache', () => {
    it('stores the fetched snapshot under rates:monobank:v1 with the cache TTL after a live conversion', async () => {
      expect(successOf(await post(EUR_TO_GBP)).source).toBe('live');

      expect(redis.valueOf(RATES_CACHE_KEY)).toEqual(expect.any(String));
      expect(redis.expirySecondsOf(RATES_CACHE_KEY)).toBe(cacheTtlSeconds());
    });

    it('reports source cache on a second conversion within the cache TTL', async () => {
      await post(EUR_TO_GBP).expect(200);

      expect(successOf(await post(EUR_TO_GBP)).source).toBe('cache');
    });

    it('does not call the rate provider for a conversion served from cache', async () => {
      await post(EUR_TO_GBP).expect(200);
      provider.getRates.mockClear();

      const body = successOf(await convert('USD', 'EUR', '100'));

      expect(body.source).toBe('cache');
      expect(provider.getRates).not.toHaveBeenCalled();
    });

    it('reports source live once the cached snapshot is older than the cache TTL', async () => {
      await post(EUR_TO_GBP).expect(200);
      ageBy(cacheTtlSeconds() * 1000 + 1);

      expect(successOf(await post(EUR_TO_GBP)).source).toBe('live');
      expect(provider.getRates).toHaveBeenCalledTimes(2);
    });

    it('answers 200 from cache while the provider is failing and a fresh snapshot is cached', async () => {
      await post(EUR_TO_GBP).expect(200);
      provider.getRates.mockRejectedValue(new UpstreamHttpError(500));

      expect(successOf(await post(EUR_TO_GBP)).source).toBe('cache');
    });

    it('answers 200 with source live when every Redis read fails', async () => {
      redis.failWith(new Error('connect ECONNREFUSED'), ['get']);

      const first = successOf(await post(EUR_TO_GBP));
      const second = successOf(await post(EUR_TO_GBP));

      expect([first.source, second.source]).toEqual(['live', 'live']);
      expect(first.convertedAmount).toBe(86.46);
    });

    it('answers 503 UPSTREAM_UNAVAILABLE, not CACHE_UNAVAILABLE, when Redis and the provider both fail', async () => {
      redis.disconnect();
      provider.getRates.mockRejectedValue(new UpstreamHttpError(500));

      expectUpstreamUnavailable(await post(EUR_TO_GBP));
    });

    it('answers live when the cached value is corrupt', async () => {
      redis.putString(RATES_CACHE_KEY, 'garbage');

      expect(successOf(await post(EUR_TO_GBP)).source).toBe('live');
    });

    it('stores a valid JSON snapshot after reading a corrupt cached value', async () => {
      redis.putString(RATES_CACHE_KEY, 'garbage');

      await post(EUR_TO_GBP).expect(200);
      const stored = JSON.parse(redis.valueOf(RATES_CACHE_KEY) ?? 'null') as {
        readonly rates?: unknown;
        readonly fetchedAt?: unknown;
      };

      expect(Array.isArray(stored.rates)).toBe(true);
      expect(stored.rates).toHaveLength(8);
      expect(typeof stored.fetchedAt).toBe('string');
    });

    it('returns the same rateDate from cache as the live call that stored it', async () => {
      const live = successOf(await post(EUR_TO_GBP));
      const cached = successOf(await post(EUR_TO_GBP));

      expect([live.source, cached.source]).toEqual(['live', 'cache']);
      expect(cached.rateDate).toBe(live.rateDate);
      expect(cached).toEqual({ ...live, source: 'cache' });
    });

    it('answers with the cached rates while a fresh snapshot is cached though the provider changed', async () => {
      await post(EUR_TO_GBP).expect(200);
      provider.snapshot = (fetchedAt) =>
        snapshotOf(
          fixtureQuotesWith('EUR', 'UAH', {
            buy: '50',
            sell: '51',
            asOf: '2026-09-11T09:00:00.000Z',
          }),
          fetchedAt,
        );

      const body = successOf(await convert('EUR', 'UAH', '100'));

      expect([body.convertedAmount, body.source]).toEqual([4790, 'cache']);
    });
  });

  describe('concurrent conversions', () => {
    async function sendTen(): Promise<Response[]> {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      provider.getRates.mockImplementation(async () => {
        await gate;
        return defaultFixtureSnapshot(new Date());
      });
      const pending = Array.from({ length: 10 }, () => post(EUR_TO_GBP).then((r) => r));
      await new Promise((resolve) => setTimeout(resolve, 50));
      release();
      return Promise.all(pending);
    }

    it('calls the rate provider once for 10 concurrent conversions on an empty cache', async () => {
      await sendTen();

      expect(provider.getRates).toHaveBeenCalledTimes(1);
    });

    it('answers all 10 concurrent conversions with 200', async () => {
      const responses = await sendTen();

      expect(responses.map((response) => response.status)).toEqual(Array(10).fill(200));
      expect(responses.map((response) => (response.body as ConvertBody).convertedAmount)).toEqual(
        Array(10).fill(86.46),
      );
    });
  });

  describe('routing', () => {
    it('answers unknown routes and unserved methods with 404 NOT_FOUND "Cannot <METHOD> <path>"', async () => {
      for (const [method, path] of [
        ['get', '/api/nope'],
        ['get', '/'],
        ['get', '/api/convert'],
        ['delete', '/api/currencies'],
      ] as const) {
        const response = await agent()[method](path);

        expect(response.status).toBe(404);
        expect(errorOf(response)).toEqual({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Cannot ${method.toUpperCase()} ${path}`,
          timestamp: expect.any(String),
          path,
        });
      }
    });

    it('answers POST /health with 404 NOT_FOUND in the error envelope', async () => {
      const response = await agent().post('/health');

      expect(response.status).toBe(404);
      expect(errorOf(response)).toEqual({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Cannot POST /health',
        timestamp: expect.any(String),
        path: '/health',
      });
    });
  });

  describe('API documentation', () => {
    async function docs(): Promise<OpenApiDocument> {
      const response = await agent().get('/api/docs-json');
      expect(response.status).toBe(200);
      return response.body as OpenApiDocument;
    }

    it('describes POST /api/convert in docs-json with from, to and amount each carrying an example', async () => {
      const document = await docs();
      const ref =
        document.paths['/api/convert']?.['post']?.requestBody?.content[JSON_TYPE]?.schema.$ref;
      const schemaName = ref?.split('/').pop() ?? '';
      const properties = document.components.schemas[schemaName]?.properties ?? {};

      expect(Object.keys(properties)).toEqual(['from', 'to', 'amount']);
      for (const field of ['from', 'to', 'amount']) {
        expect(properties[field]?.example).toBeDefined();
      }
    });

    it('lists 200, 400, 415, 422 and 503 for convert and 200 and 503 for currencies in docs-json', async () => {
      const document = await docs();

      expect(Object.keys(document.paths['/api/convert']?.['post']?.responses ?? {}).sort()).toEqual(
        ['200', '400', '415', '422', '503'],
      );
      expect(
        Object.keys(document.paths['/api/currencies']?.['get']?.responses ?? {}).sort(),
      ).toEqual(['200', '503']);
    });
  });
});
