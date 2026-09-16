import nock from 'nock';
import request, { type Response } from 'supertest';
import { MonobankRateProvider } from './rates/providers/monobank/monobank-rate.provider';
import { RATE_PROVIDER, RATES_REPOSITORY } from './rates/rates.tokens';
import { RedisRatesRepository } from './rates/repository/redis-rates.repository';
import { createTestApp, type LogLine, type TestApp } from './testing/test-app';

interface HealthBody {
  readonly status: string;
  readonly info: { readonly redis?: { readonly status: string } };
  readonly error: { readonly redis?: { readonly status: string; readonly message?: string } };
}

interface NotFoundBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: unknown;
  readonly timestamp: string;
  readonly path: string;
}

type Method = 'GET' | 'POST' | 'DELETE';

describe('application wiring', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(() => {
    testApp.redis.ping.mockReset();
    testApp.redis.ping.mockResolvedValue('PONG');
    testApp.clearLogs();
  });

  function send(method: Method, path: string): request.Test {
    const agent = request(testApp.app.getHttpServer());
    switch (method) {
      case 'GET':
        return agent.get(path);
      case 'POST':
        return agent.post(path);
      case 'DELETE':
        return agent.delete(path);
    }
  }

  // The completion line is written on the response's `finish` event; let it land.
  async function settled(pending: request.Test): Promise<Response> {
    const response = await pending;
    await new Promise((resolve) => setImmediate(resolve));
    return response;
  }

  function redisDown(error = new Error('Connection is closed.')): void {
    testApp.redis.ping.mockRejectedValue(error);
  }

  function completionLines(): readonly LogLine[] {
    return testApp.logLines().filter((line) => line.res !== undefined);
  }

  describe('GET /health', () => {
    it('answers GET /health with 200 while Redis replies to PING', async () => {
      await send('GET', '/health').expect(200);
    });

    it('returns status ok and info.redis.status up on /health while Redis is reachable', async () => {
      const response = await send('GET', '/health');
      const body = response.body as HealthBody;

      expect(body.status).toBe('ok');
      expect(body.info.redis?.status).toBe('up');
    });

    it('answers GET /health with 503 while Redis PING fails', async () => {
      redisDown();

      await send('GET', '/health').expect(503);
    });

    it('returns status error and error.redis.status down on /health while Redis is unreachable', async () => {
      redisDown();

      const response = await send('GET', '/health');
      const body = response.body as HealthBody;

      expect(body.status).toBe('error');
      expect(body.error.redis?.status).toBe('down');
    });

    it('keeps the terminus body without a code field on /health while Redis is unreachable', async () => {
      redisDown();

      const response = await send('GET', '/health');
      const body = response.body as HealthBody & Record<string, unknown>;

      expect(response.status).toBe(503);
      expect(body.status).toBe('error');
      expect(body.error.redis?.status).toBe('down');
      expect(body).not.toHaveProperty('code');
      expect(body).not.toHaveProperty('path');
    });

    it('returns a /health body without the Redis password when PING fails with a URL in the error', async () => {
      redisDown(new Error('connect to redis://:s3cret-pw@redis:6379 failed'));

      const response = await send('GET', '/health');

      expect(response.status).toBe(503);
      expect(response.text).not.toContain('s3cret-pw');
    });
  });

  describe('rate upstream', () => {
    afterEach(() => {
      nock.cleanAll();
      nock.enableNetConnect();
    });

    it('sends no request to the rate upstream while the application boots', async () => {
      nock.disableNetConnect();
      nock.enableNetConnect('127.0.0.1');
      const upstream = nock(/.*/).get(/.*/).reply(200, '[]').persist();
      const booted = await createTestApp();

      await booted.app.close();

      expect(upstream.isDone()).toBe(false);
    });

    it('sends no Redis command other than PING while the application boots', async () => {
      const booted = await createTestApp();

      await booted.app.close();

      expect(booted.redis.get).not.toHaveBeenCalled();
      expect(booted.redis.set).not.toHaveBeenCalled();
      expect(booted.redis.del).not.toHaveBeenCalled();
    });
  });

  describe('dependency wiring', () => {
    it('binds RATES_REPOSITORY to the Redis repository and RATE_PROVIDER to the Monobank provider at boot', () => {
      expect(testApp.app.get(RATES_REPOSITORY)).toBeInstanceOf(RedisRatesRepository);
      expect(testApp.app.get(RATE_PROVIDER)).toBeInstanceOf(MonobankRateProvider);
    });
  });

  describe('routing and documentation', () => {
    it('responds 404 to GET /api/health because /health is outside the api prefix', async () => {
      await send('GET', '/api/health').expect(404);
    });

    it('serves Swagger UI as HTML at GET /api/docs', async () => {
      const response = await send('GET', '/api/docs');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/html/);
      expect(response.text).toContain('swagger-ui');
    });

    it('serves an OpenAPI 3 JSON document at GET /api/docs-json', async () => {
      const response = await send('GET', '/api/docs-json');
      const body = response.body as { readonly openapi?: unknown };

      expect(response.status).toBe(200);
      expect(String(body.openapi)).toMatch(/^3\./);
    });

    it.each(['/api/nope', '/nope', '/'])(
      'responds 404 with a JSON content type to GET %s for an unknown route',
      async (path) => {
        const response = await send('GET', path);

        expect(response.status).toBe(404);
        expect(response.headers['content-type']).toMatch(/^application\/json/);
      },
    );

    it('returns statusCode 404 and a non-empty message for an unknown route', async () => {
      const response = await send('GET', '/api/nope');
      const body = response.body as NotFoundBody;

      expect(body.statusCode).toBe(404);
      expect(typeof body.message).toBe('string');
      expect(body.message).not.toBe('');
    });

    it('responds 404 NOT_FOUND in the error envelope to POST /health and DELETE /api/docs', async () => {
      for (const [method, path] of [
        ['POST', '/health'],
        ['DELETE', '/api/docs'],
      ] as const) {
        const response = await send(method, path);
        const body = response.body as NotFoundBody;

        expect(response.status).toBe(404);
        expect(body).toEqual({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Cannot ${method} ${path}`,
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          path,
        });
      }
    });
  });

  describe('request logging', () => {
    it('writes every log line as one JSON object', async () => {
      await settled(send('GET', '/api/nope'));
      await settled(send('GET', '/api/docs'));
      redisDown();
      await settled(send('GET', '/health'));

      const raw = testApp.rawLogLines();

      expect(raw.length).toBeGreaterThan(0);
      for (const line of raw) {
        expect(JSON.parse(line)).toEqual(expect.any(Object));
      }
    });

    it('writes a lower-case level label on every log line', async () => {
      await settled(send('GET', '/api/nope'));
      redisDown();
      await settled(send('GET', '/health'));

      const levels = testApp.logLines().map((line) => line.level);

      expect(levels.length).toBeGreaterThan(0);
      for (const level of levels) {
        expect(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).toContain(level);
      }
    });

    it.each([
      ['GET', '/api/nope', 404],
      ['GET', '/nope', 404],
      ['GET', '/', 404],
      ['GET', '/api/docs', 200],
      ['GET', '/api/docs-json', 200],
      ['GET', '/health', 503],
    ] as const)(
      'writes exactly one completion line with reqId, method, path and status for %s %s',
      async (method, path, statusCode) => {
        if (path === '/health') {
          redisDown();
        }

        await settled(send(method, path));
        const lines = completionLines();

        expect(lines).toHaveLength(1);
        expect(typeof lines[0]?.reqId).toBe('string');
        expect(lines[0]?.reqId).not.toBe('');
        expect(lines[0]?.req).toEqual(expect.objectContaining({ method, url: path }));
        expect(lines[0]?.res?.statusCode).toBe(statusCode);
      },
    );

    it('logs an unknown-route 404 at warn and a failing health check at error', async () => {
      await settled(send('GET', '/api/nope'));
      redisDown();
      await settled(send('GET', '/health'));

      expect(completionLines().map((line) => [line.req?.url, line.level])).toEqual([
        ['/api/nope', 'warn'],
        ['/health', 'error'],
      ]);
    });

    it('writes no log line for a /health request that answered 200', async () => {
      await settled(send('GET', '/health').expect(200));

      expect(testApp.rawLogLines()).toEqual([]);
    });

    it('logs a different reqId for two separate requests', async () => {
      await settled(send('GET', '/api/nope'));
      await settled(send('GET', '/api/nope'));

      const ids = completionLines().map((line) => line.reqId);

      expect(ids).toHaveLength(2);
      expect(ids[0]).not.toEqual(ids[1]);
    });

    it("carries the request's reqId on log lines written while handling the request", async () => {
      redisDown();

      await settled(send('GET', '/health'));
      const lines = testApp.logLines();
      const completion = completionLines()[0];

      expect(lines.length).toBeGreaterThan(1);
      expect(completion?.reqId).toEqual(expect.any(String));
      for (const line of lines) {
        expect(line.reqId).toBe(completion?.reqId);
      }
    });
  });
});
