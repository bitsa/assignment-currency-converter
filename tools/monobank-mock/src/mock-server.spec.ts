import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { parseFixture, type Fixture } from './fixture';
import { MOCK_MODES, type MockMode } from './mock-mode';
import type { MockStateView } from './mock-state';
import { createMockServer } from './mock-server';

const DEFAULT_TEXT =
  '[{"currencyCodeA":840,"currencyCodeB":980,"date":1789113600,"rateBuy":41.10,"rateSell":41.60},' +
  '{"currencyCodeA":826,"currencyCodeB":980,"date":1789102800,"rateCross":55.40}]';
const DEFAULT_FIXTURE = parseFixture(DEFAULT_TEXT) as Fixture;

describe('mock server', () => {
  let server: http.Server;
  let origin: string;

  beforeEach(async () => {
    server = createMockServer(DEFAULT_FIXTURE);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  function currency(signal?: AbortSignal): Promise<Response> {
    return fetch(`${origin}/bank/currency`, signal ? { signal } : {});
  }

  function post(path: string, body: string): Promise<Response> {
    return fetch(`${origin}${path}`, { method: 'POST', body });
  }

  async function state(): Promise<MockStateView> {
    return (await (await fetch(`${origin}/__admin/state`)).json()) as MockStateView;
  }

  async function setMode(mode: MockMode): Promise<void> {
    expect((await post('/__admin/mode', JSON.stringify({ mode }))).status).toBe(200);
  }

  /** A GET /bank/currency that settles either with a response or when `ms` passes. */
  async function currencyWithin(ms: number): Promise<Response | 'no response'> {
    try {
      return await currency(AbortSignal.timeout(ms));
    } catch {
      return 'no response';
    }
  }

  it('answers GET /bank/currency in mode ok with 200, application/json and the current fixture', async () => {
    const response = await currency();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe(DEFAULT_TEXT);
  });

  it('answers GET /bank/currency in mode http500 with 500', async () => {
    await setMode('http500');

    const response = await currency();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ errorDescription: 'Internal server error' });
  });

  it('answers GET /bank/currency in mode http429 with 429 and errorDescription Too many requests', async () => {
    await setMode('http429');

    const response = await currency();

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ errorDescription: 'Too many requests' });
  });

  it('holds a GET /bank/currency in mode timeout without sending a status line', async () => {
    await setMode('timeout');

    expect(await currencyWithin(1000)).toBe('no response');
  });

  it('answers GET /bank/currency in mode malformed with 200, application/json and a body that does not parse as JSON', async () => {
    await setMode('malformed');

    const response = await currency();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(() => JSON.parse(text) as unknown).toThrow(SyntaxError);
  });

  it('answers GET /bank/currency in mode empty with 200 and body []', async () => {
    await setMode('empty');

    const response = await currency();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('[]');
  });

  it('answers POST /__admin/mode http500 with 200 and a state whose mode is http500', async () => {
    const response = await post('/__admin/mode', '{"mode":"http500"}');

    expect(response.status).toBe(200);
    expect(((await response.json()) as MockStateView).mode).toBe('http500');
  });

  it('keeps answering every following GET /bank/currency in the set mode until it changes', async () => {
    await setMode('http429');

    const statuses = [
      (await currency()).status,
      (await currency()).status,
      (await currency()).status,
    ];
    await setMode('ok');

    expect(statuses).toEqual([429, 429, 429]);
    expect((await currency()).status).toBe(200);
  });

  it('serves a posted fixture array byte for byte on the next GET /bank/currency in mode ok', async () => {
    const text =
      '[ {"currencyCodeA":978, "currencyCodeB":980, "date":1789113600, "rateBuy":47.9000} ]';

    expect((await post('/__admin/fixture', text)).status).toBe(200);

    expect(await (await currency()).text()).toBe(text);
  });

  it('answers GET /__admin/state with 200 and mode, requests and fixtureItems', async () => {
    const response = await fetch(`${origin}/__admin/state`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: 'ok', requests: 0, fixtureItems: 2 });
  });

  it.each(MOCK_MODES)(
    'increases requests by exactly 1 for a GET /bank/currency in mode %s',
    async (mode) => {
      await setMode(mode);

      const response = await currencyWithin(300);
      if (response !== 'no response') {
        await response.text();
      }

      expect((await state()).requests).toBe(1);
    },
  );

  it('leaves requests unchanged for requests to every /__admin endpoint', async () => {
    await post('/__admin/mode', '{"mode":"empty"}');
    await post('/__admin/mode', '{"mode":"slow"}');
    await post('/__admin/fixture', '[]');
    await post('/__admin/fixture', '{}');
    await state();
    await post('/__admin/reset', '');

    expect((await state()).requests).toBe(0);
  });

  it('resets to mode ok, requests 0 and the default fixture item count on POST /__admin/reset', async () => {
    await setMode('http500');
    await post('/__admin/fixture', '[1,2,3,4,5]');
    await currency();

    const response = await post('/__admin/reset', '');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: 'ok', requests: 0, fixtureItems: 2 });
    expect(await (await currency()).text()).toBe(DEFAULT_TEXT);
  });

  it.each(['{"mode":"HTTP500"}', '{"mode":"slow"}', '{}', 'not json'])(
    'answers 400 to POST /__admin/mode with %s and keeps the previous mode',
    async (body) => {
      await setMode('empty');

      const response = await post('/__admin/mode', body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: expect.any(String) });
      expect((await state()).mode).toBe('empty');
    },
  );

  it.each(['{}', '"x"', 'not json'])(
    'answers 400 to POST /__admin/fixture with %s and keeps the previous fixture',
    async (body) => {
      const response = await post('/__admin/fixture', body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: expect.any(String) });
      expect(await (await currency()).text()).toBe(DEFAULT_TEXT);
    },
  );

  it('accepts [] as a fixture and serves [] in mode ok', async () => {
    const response = await post('/__admin/fixture', '[]');

    expect(response.status).toBe(200);
    expect(((await response.json()) as MockStateView).fixtureItems).toBe(0);
    expect(await (await currency()).text()).toBe('[]');
  });

  it('serves fixture items that break the Monobank item rules unchanged', async () => {
    const text = '[{"currencyCodeA":"840","date":-1,"rateBuy":0},null,42]';

    await post('/__admin/fixture', text);

    expect(await (await currency()).text()).toBe(text);
  });

  it('keeps answering later requests after a client waiting in mode timeout disconnects', async () => {
    await setMode('timeout');
    expect(await currencyWithin(200)).toBe('no response');

    await setMode('ok');

    expect((await currency()).status).toBe(200);
  });

  it('answers a new GET /bank/currency with 200 within 1 second after switching from timeout to ok while a request is still held', async () => {
    await setMode('timeout');
    const waiting = new AbortController();
    const held = currency(waiting.signal).catch(() => 'aborted');

    await setMode('ok');
    const response = await currencyWithin(1000);

    expect(response).not.toBe('no response');
    expect((response as Response).status).toBe(200);
    waiting.abort();
    await held;
  });

  it.each([
    ['GET', '/bank/other'],
    ['POST', '/bank/currency'],
  ])('answers 404 to %s %s', async (method, path) => {
    const response = await fetch(`${origin}${path}`, { method });

    expect(response.status).toBe(404);
  });

  it('answers 20 concurrent GET /bank/currency requests with 200 and reports requests 20', async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, () => currency()));

    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(200));
    expect((await state()).requests).toBe(20);
  });
});
