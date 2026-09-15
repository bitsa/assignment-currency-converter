import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import nock from 'nock';
import { Readable } from 'node:stream';
import { UpstreamHttpError } from '../errors/upstream-http.error';
import { UpstreamInvalidResponseError } from '../errors/upstream-invalid-response.error';
import { UpstreamNetworkError } from '../errors/upstream-network.error';
import { UpstreamRateLimitedError } from '../errors/upstream-rate-limited.error';
import { UpstreamTimeoutError } from '../errors/upstream-timeout.error';
import { UpstreamError } from '../errors/upstream.error';
import * as mapper from './monobank-rate.mapper';
import { MONOBANK_MAX_BODY_BYTES, MonobankRateProvider } from './monobank-rate.provider';

const ORIGIN = 'http://monobank.test';
const TIMEOUT_MS = 200;

const USD_UAH = {
  currencyCodeA: 840,
  currencyCodeB: 980,
  date: 1789113600,
  rateBuy: 41.1,
  rateSell: 41.6,
};
const GBP_UAH = { currencyCodeA: 826, currencyCodeB: 980, date: 1789102800, rateCross: 55.4 };
const VALID_BODY = JSON.stringify([USD_UAH, GBP_UAH]);

function setup(
  baseUrl = ORIGIN,
  timeoutMs = TIMEOUT_MS,
): {
  provider: MonobankRateProvider;
  warn: jest.Mock;
} {
  const warn = jest.fn();
  const provider = new MonobankRateProvider(
    new HttpService(axios.create()),
    { baseUrl, timeoutMs },
    { warn },
  );
  return { provider, warn };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

/** nock only fails the request for an `Error` instance; a plain object leaves it hanging. */
function systemError(code: string, message = `connect ${code}`): Error {
  return Object.assign(new Error(message), { code });
}

/** A body stream that sends one byte and then nothing more. */
function stalledBody(): Readable {
  const stream = new Readable({ read: () => undefined });
  stream.push('[');
  return stream;
}

describe('MonobankRateProvider', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  it('sends exactly one GET /bank/currency request with accept: application/json per call', async () => {
    const scope = nock(ORIGIN, { reqheaders: { accept: 'application/json' } })
      .get('/bank/currency')
      .once()
      .reply(200, VALID_BODY);
    const { provider } = setup();

    await provider.getRates();

    expect(scope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('requests /bank/currency, not //bank/currency, when the base URL ends with a slash', async () => {
    const scope = nock(ORIGIN).get('/bank/currency').reply(200, VALID_BODY);
    const { provider } = setup(`${ORIGIN}/`);

    await provider.getRates();

    expect(scope.isDone()).toBe(true);
  });

  it('resolves a snapshot with one rate per usable item mapped from numeric to alpha codes', async () => {
    nock(ORIGIN).get('/bank/currency').reply(200, VALID_BODY);
    const { provider } = setup();

    const snapshot = await provider.getRates();

    expect(snapshot.rates.map((rate) => [rate.base.value, rate.quote.value])).toEqual([
      ['USD', 'UAH'],
      ['GBP', 'UAH'],
    ]);
  });

  it('sets fetchedAt between the start of the call and its resolution', async () => {
    nock(ORIGIN).get('/bank/currency').delay(20).reply(200, VALID_BODY);
    const { provider } = setup();

    const before = Date.now();
    const snapshot = await provider.getRates();
    const after = Date.now();

    expect(snapshot.fetchedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(snapshot.fetchedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('writes one warn line rates.provider_items_skipped with the count, unknown codes and duplicate and same-currency pairs', async () => {
    const items = [
      USD_UAH,
      { ...GBP_UAH, currencyCodeA: 959 },
      { ...GBP_UAH, currencyCodeA: 980 },
      { ...USD_UAH, rateBuy: 50 },
    ];
    nock(ORIGIN).get('/bank/currency').reply(200, JSON.stringify(items));
    const { provider, warn } = setup();

    await provider.getRates();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      {
        event: 'rates.provider_items_skipped',
        skipped: 3,
        unknownCodes: [959],
        sameCurrencyPairs: ['UAH/UAH'],
        duplicatePairs: ['USD/UAH'],
      },
      'Skipped 3 Monobank items',
    );
  });

  it('writes no skipped-items log line when no item is skipped', async () => {
    nock(ORIGIN).get('/bank/currency').reply(200, VALID_BODY);
    const { provider, warn } = setup();

    await provider.getRates();

    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves the response body out of the skipped-items log line', async () => {
    const items = [USD_UAH, { ...GBP_UAH, currencyCodeA: 959, rateCross: 12345.678 }];
    nock(ORIGIN).get('/bank/currency').reply(200, JSON.stringify(items));
    const { provider, warn } = setup();

    await provider.getRates();

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('12345.678');
    expect(logged).not.toContain('41.6');
    expect(logged).not.toContain('rateCross');
  });

  it('rejects with UpstreamRateLimitedError when Monobank answers 429', async () => {
    nock(ORIGIN).get('/bank/currency').reply(429, '{"errorDescription":"Too many requests"}');
    const { provider } = setup();

    await expect(provider.getRates()).rejects.toBeInstanceOf(UpstreamRateLimitedError);
  });

  it('rejects with UpstreamRateLimitedError for a 429 that carries Retry-After', async () => {
    nock(ORIGIN).get('/bank/currency').reply(429, '', { 'retry-after': '60' });
    const { provider } = setup();

    await expect(provider.getRates()).rejects.toBeInstanceOf(UpstreamRateLimitedError);
  });

  it.each([500, 502, 503, 504])(
    'rejects with UpstreamHttpError carrying status %i for a 5xx answer',
    async (status) => {
      nock(ORIGIN).get('/bank/currency').reply(status, '{"errorDescription":"x"}');
      const { provider } = setup();

      const error = await rejection(provider.getRates());

      expect(error).toBeInstanceOf(UpstreamHttpError);
      expect((error as UpstreamHttpError).status).toBe(status);
    },
  );

  it.each([301, 400, 403, 404])(
    'rejects with UpstreamHttpError carrying status %i without following a redirect',
    async (status) => {
      nock(ORIGIN)
        .get('/bank/currency')
        .reply(status, '', { location: `${ORIGIN}/elsewhere` });
      const elsewhere = nock(ORIGIN).get('/elsewhere').reply(200, VALID_BODY);
      const { provider } = setup();

      const error = await rejection(provider.getRates());

      expect(error).toBeInstanceOf(UpstreamHttpError);
      expect((error as UpstreamHttpError).status).toBe(status);
      expect(elsewhere.isDone()).toBe(false);
    },
  );

  it('rejects with UpstreamTimeoutError within the timeout plus 500 ms when no response arrives', async () => {
    nock(ORIGIN).get('/bank/currency').delay(5000).reply(200, VALID_BODY);
    const { provider } = setup();

    const started = Date.now();
    const error = await rejection(provider.getRates());

    expect(error).toBeInstanceOf(UpstreamTimeoutError);
    expect(Date.now() - started).toBeLessThanOrEqual(TIMEOUT_MS + 500);
  });

  it('rejects with UpstreamTimeoutError when the headers arrive but the body stalls past the timeout', async () => {
    nock(ORIGIN)
      .get('/bank/currency')
      .reply(200, () => stalledBody());
    const { provider } = setup();

    const started = Date.now();
    const error = await rejection(provider.getRates());

    expect(error).toBeInstanceOf(UpstreamTimeoutError);
    expect(Date.now() - started).toBeLessThanOrEqual(TIMEOUT_MS + 500);
  });

  it('rejects with UpstreamInvalidResponseError when a 200 body is not valid JSON', async () => {
    nock(ORIGIN).get('/bank/currency').reply(200, '[{"currencyCodeA":840,');
    const { provider } = setup();

    await expect(provider.getRates()).rejects.toBeInstanceOf(UpstreamInvalidResponseError);
  });

  it('rejects with UpstreamInvalidResponseError when Monobank answers 200 with []', async () => {
    nock(ORIGIN).get('/bank/currency').reply(200, '[]');
    const { provider } = setup();

    await expect(provider.getRates()).rejects.toBeInstanceOf(UpstreamInvalidResponseError);
  });

  it.each([200, 204])(
    'rejects with UpstreamInvalidResponseError for status %i with an empty body',
    async (status) => {
      nock(ORIGIN).get('/bank/currency').reply(status);
      const { provider } = setup();

      await expect(provider.getRates()).rejects.toBeInstanceOf(UpstreamInvalidResponseError);
    },
  );

  it('rejects with UpstreamInvalidResponseError when the body is larger than 1048576 bytes', async () => {
    nock(ORIGIN)
      .get('/bank/currency')
      .reply(200, `${VALID_BODY}${' '.repeat(MONOBANK_MAX_BODY_BYTES - VALID_BODY.length + 1)}`);
    const { provider } = setup();

    await expect(provider.getRates()).rejects.toBeInstanceOf(UpstreamInvalidResponseError);
  });

  it('accepts a valid body of exactly 1048576 bytes', async () => {
    const body = `${VALID_BODY}${' '.repeat(MONOBANK_MAX_BODY_BYTES - VALID_BODY.length)}`;
    expect(Buffer.byteLength(body)).toBe(MONOBANK_MAX_BODY_BYTES);
    nock(ORIGIN).get('/bank/currency').reply(200, body);
    const { provider } = setup();

    const snapshot = await provider.getRates();

    expect(snapshot.rates).toHaveLength(2);
  });

  it('resolves a snapshot for a valid array served as text/plain', async () => {
    nock(ORIGIN).get('/bank/currency').reply(200, VALID_BODY, { 'content-type': 'text/plain' });
    const { provider } = setup();

    const snapshot = await provider.getRates();

    expect(snapshot.rates).toHaveLength(2);
  });

  it('rejects with UpstreamInvalidResponseError for an HTML body served as text/html', async () => {
    nock(ORIGIN)
      .get('/bank/currency')
      .reply(200, '<!doctype html><html><body>Maintenance</body></html>', {
        'content-type': 'text/html',
      });
    const { provider } = setup();

    await expect(provider.getRates()).rejects.toBeInstanceOf(UpstreamInvalidResponseError);
  });

  it('rejects with UpstreamInvalidResponseError when every item has an unknown code', async () => {
    const items = [
      { ...USD_UAH, currencyCodeA: 959 },
      { ...GBP_UAH, currencyCodeA: 999 },
    ];
    nock(ORIGIN).get('/bank/currency').reply(200, JSON.stringify(items));
    const { provider } = setup();

    await expect(provider.getRates()).rejects.toBeInstanceOf(UpstreamInvalidResponseError);
  });

  it.each(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND'])(
    'rejects with UpstreamNetworkError when the connection fails with %s',
    async (code) => {
      nock(ORIGIN).get('/bank/currency').replyWithError(systemError(code));
      const { provider } = setup();

      const error = await rejection(provider.getRates());

      expect(error).toBeInstanceOf(UpstreamNetworkError);
      expect((error as Error).message).toBe(`Monobank request failed: ${code}`);
    },
  );

  it('keeps the password from a base URL with credentials out of the error message and every log line', async () => {
    const baseUrl = 'http://user:secret@monobank.test';
    const failures = [
      (): nock.Scope =>
        nock(ORIGIN)
          .get('/bank/currency')
          .replyWithError(systemError('ECONNREFUSED', `connect to ${baseUrl} refused`)),
      (): nock.Scope => nock(ORIGIN).get('/bank/currency').reply(500),
      (): nock.Scope => nock(ORIGIN).get('/bank/currency').reply(200, 'not json'),
      (): nock.Scope =>
        nock(ORIGIN)
          .get('/bank/currency')
          .reply(200, JSON.stringify([{ ...USD_UAH, currencyCodeA: 959 }])),
    ];
    const { provider, warn } = setup(baseUrl);

    for (const fail of failures) {
      fail();
      const error = await rejection(provider.getRates());

      expect(error).toBeInstanceOf(UpstreamError);
      expect(String((error as Error).message)).not.toContain('secret');
      expect(JSON.stringify(error)).not.toContain('secret');
    }
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  });

  it('exposes every failure as an UpstreamError with code UPSTREAM_UNAVAILABLE and status 503', async () => {
    nock(ORIGIN).get('/bank/currency').reply(429);
    nock(ORIGIN).get('/bank/currency').reply(503);
    nock(ORIGIN).get('/bank/currency').delay(5000).reply(200, VALID_BODY);
    nock(ORIGIN).get('/bank/currency').replyWithError(systemError('ECONNRESET'));
    nock(ORIGIN).get('/bank/currency').reply(200, '{}');
    const { provider } = setup();

    for (let attempt = 0; attempt < 5; attempt++) {
      const error = await rejection(provider.getRates());

      expect(error).toBeInstanceOf(UpstreamError);
      expect((error as UpstreamError).code).toBe('UPSTREAM_UNAVAILABLE');
      expect((error as UpstreamError).httpStatus).toBe(503);
    }
  });

  it('sends two upstream requests for two concurrent calls', async () => {
    const scope = nock(ORIGIN).get('/bank/currency').twice().delay(20).reply(200, VALID_BODY);
    const { provider } = setup();

    await Promise.all([provider.getRates(), provider.getRates()]);

    expect(scope.isDone()).toBe(true);
  });

  it('lets a non-upstream error raised while mapping a valid body propagate instead of reporting it as UpstreamNetworkError', async () => {
    const defect = new TypeError('mapping defect');
    jest.spyOn(mapper, 'mapMonobankItems').mockImplementation(() => {
      throw defect;
    });
    nock(ORIGIN).get('/bank/currency').reply(200, VALID_BODY);
    const { provider } = setup();

    await expect(provider.getRates()).rejects.toBe(defect);
  });
});
