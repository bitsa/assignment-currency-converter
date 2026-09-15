import { F_BROKEN, F_EXAMPLE, F_ORDER, SUPPORTED_NUMERIC_CODES } from './fixtures/monobank';
import {
  TEST_STACK_ENV,
  getCurrency,
  holdCurrencyRequest,
  mockRequest,
  postAdmin,
  reset,
  setFixture,
  setMode,
  state,
  type HeldRequest,
} from './helpers/mock';
import { containerInfo } from './helpers/stack';
import { delay, pollUntil } from './helpers/wait';

// Precondition: the test stack is up, with monobank-mock published on 127.0.0.1:8081.
const JSON_TYPE = /^application\/json/;
const NON_EMPTY_ERROR = { error: expect.stringMatching(/\S/) as unknown };

type Item = Readonly<Record<string, unknown>>;

function isItem(value: unknown): value is Item {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseArray(text: string): unknown[] {
  const value = JSON.parse(text) as unknown;
  if (!Array.isArray(value)) {
    throw new Error(`expected a JSON array, got ${text.slice(0, 200)}`);
  }
  return value;
}

async function withHeld(body: (held: HeldRequest) => Promise<void>): Promise<void> {
  const held = await holdCurrencyRequest();
  try {
    await body(held);
  } finally {
    await held.abort();
  }
}

describe('Monobank mock', () => {
  let defaultText = '';
  let defaultFixture: unknown[] = [];

  beforeAll(async () => {
    await reset();
    defaultText = (await getCurrency()).text;
    defaultFixture = parseArray(defaultText);
  });

  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    await reset();
  });

  describe('modes', () => {
    it('serves the current fixture with 200 and a JSON content type in mode ok', async () => {
      await setFixture(F_EXAMPLE);

      const response = await getCurrency();

      expect(response.status).toBe(200);
      expect(response.contentType).toMatch(JSON_TYPE);
      expect(JSON.parse(response.text)).toEqual(F_EXAMPLE);
    });

    it("answers 500 with Monobank's internal error body in mode http500", async () => {
      await setMode('http500');

      const response = await getCurrency();

      expect(response.status).toBe(500);
      expect(response.contentType).toMatch(JSON_TYPE);
      expect(response.json).toEqual({ errorDescription: 'Internal server error' });
    });

    it('answers 429 with {"errorDescription":"Too many requests"} in mode http429', async () => {
      await setMode('http429');

      const response = await getCurrency();

      expect(response.status).toBe(429);
      expect(response.contentType).toMatch(JSON_TYPE);
      expect(response.json).toEqual({ errorDescription: 'Too many requests' });
    });

    it('accepts the connection and sends no status line for at least 10 seconds in mode timeout', async () => {
      await setMode('timeout');

      await withHeld(async (held) => {
        await delay(10_500);

        expect(held.connected()).toBe(true);
        expect(held.respondedAfterMs()).toBeUndefined();
        expect(held.error()).toBeUndefined();
      });
    }, 30_000);

    it('answers 200 with a JSON content type and a body that does not parse in mode malformed', async () => {
      await setMode('malformed');

      const response = await getCurrency();

      expect(response.status).toBe(200);
      expect(response.contentType).toMatch(JSON_TYPE);
      expect(() => JSON.parse(response.text) as unknown).toThrow();
    });

    it('answers 200 with [] in mode empty while the fixture is not empty', async () => {
      await setMode('empty');

      const response = await getCurrency();

      expect(defaultFixture.length).toBeGreaterThan(0);
      expect(response.status).toBe(200);
      expect(response.contentType).toMatch(JSON_TYPE);
      expect(JSON.parse(response.text.trim())).toEqual([]);
    });
  });

  describe('admin API', () => {
    it('answers a mode change with 200 and the new state', async () => {
      const response = await postAdmin('/__admin/mode', JSON.stringify({ mode: 'http500' }));

      expect(response.status).toBe(200);
      expect(response.json).toMatchObject({
        mode: 'http500',
        requests: 0,
        fixtureItems: defaultFixture.length,
      });
    });

    it('keeps answering in the set mode until the mode changes, even across state reads and fixture swaps', async () => {
      await setMode('http500');

      const first = await getCurrency();
      await state();
      const second = await getCurrency();
      await setFixture(F_EXAMPLE);
      const afterSwap = await state();
      const third = await getCurrency();
      await setMode('ok');
      const switched = await getCurrency();

      expect([first.status, second.status, third.status]).toEqual([500, 500, 500]);
      expect(afterSwap.mode).toBe('http500');
      expect(switched.status).toBe(200);
      expect(JSON.parse(switched.text)).toEqual(F_EXAMPLE);
    });

    it('serves a swapped fixture unchanged and in order on the next request', async () => {
      const swap = await postAdmin('/__admin/fixture', JSON.stringify(F_ORDER));
      const served = await getCurrency();
      const secondSwap = await postAdmin('/__admin/fixture', JSON.stringify(F_EXAMPLE));
      const servedAgain = await getCurrency();

      expect(swap.status).toBe(200);
      expect(swap.json).toMatchObject({ fixtureItems: 4 });
      expect(JSON.parse(served.text)).toEqual(F_ORDER);
      expect(secondSwap.json).toMatchObject({ fixtureItems: 2 });
      expect(JSON.parse(servedAgain.text)).toEqual(F_EXAMPLE);
    });

    it('reports mode, requests and fixtureItems on GET /__admin/state', async () => {
      const response = await mockRequest('GET', '/__admin/state');

      expect(response.status).toBe(200);
      expect(response.contentType).toMatch(JSON_TYPE);
      expect(response.json).toEqual({
        mode: 'ok',
        requests: 0,
        fixtureItems: defaultFixture.length,
      });
    });

    it('counts every GET /bank/currency exactly once in every mode', async () => {
      const counted: Record<string, number> = {};
      for (const mode of ['ok', 'http500', 'http429', 'malformed', 'empty']) {
        await setMode(mode);
        const before = (await state()).requests;
        await getCurrency();
        counted[mode] = (await state()).requests - before;
      }

      await setMode('timeout');
      const before = (await state()).requests;
      await withHeld(async () => {
        const during = await pollUntil(
          async () => {
            const current = (await state()).requests;
            return current !== before ? current : undefined;
          },
          2000,
          100,
        );
        counted.timeoutWhileHeld = (during ?? before) - before;
      });
      counted.timeoutAfterAbort = (await state()).requests - before;

      expect(counted).toEqual({
        ok: 1,
        http500: 1,
        http429: 1,
        malformed: 1,
        empty: 1,
        timeoutWhileHeld: 1,
        timeoutAfterAbort: 1,
      });
    });

    it('leaves the request counter unchanged for admin requests, including a rejected one', async () => {
      await getCurrency();
      const seen: number[] = [];
      const record = async (): Promise<void> => {
        seen.push((await state()).requests);
      };

      for (let read = 0; read < 3; read++) {
        await record();
      }
      await setMode('empty');
      await record();
      await setMode('ok');
      await record();
      await setFixture(F_EXAMPLE);
      await record();
      expect((await postAdmin('/__admin/mode', JSON.stringify({ mode: 'slow' }))).status).toBe(400);
      await record();

      expect(seen).toEqual([1, 1, 1, 1, 1, 1, 1]);
    });

    it('restores mode ok, the default fixture and a zero counter on reset', async () => {
      await setMode('http429');
      await setFixture(F_EXAMPLE);
      for (let call = 0; call < 3; call++) {
        await getCurrency();
      }
      expect((await state()).requests).toBe(3);

      const response = await postAdmin('/__admin/reset', '');
      const served = await getCurrency();

      expect(response.status).toBe(200);
      expect(response.json).toEqual({
        mode: 'ok',
        requests: 0,
        fixtureItems: defaultFixture.length,
      });
      expect(served.status).toBe(200);
      expect(JSON.parse(served.text)).toEqual(defaultFixture);
      expect((await state()).requests).toBe(1);
    });
  });

  describe('default fixture', () => {
    it('contains USD/UAH, EUR/UAH and EUR/USD with buy and sell, GBP/UAH and PLN/UAH with only cross, and two distinct dates', () => {
      const items = defaultFixture.filter(isItem);
      const find = (a: number, b: number): Item | undefined =>
        items.find((item) => item.currencyCodeA === a && item.currencyCodeB === b);
      const shape = (item: Item | undefined): string[] =>
        ['rateBuy', 'rateSell', 'rateCross'].filter((field) => item?.[field] !== undefined);

      expect({
        usdUah: shape(find(840, 980)),
        eurUah: shape(find(978, 980)),
        eurUsd: shape(find(978, 840)),
        gbpUah: shape(find(826, 980)),
        plnUah: shape(find(985, 980)),
      }).toEqual({
        usdUah: ['rateBuy', 'rateSell'],
        eurUah: ['rateBuy', 'rateSell'],
        eurUsd: ['rateBuy', 'rateSell'],
        gbpUah: ['rateCross'],
        plnUah: ['rateCross'],
      });
      expect(new Set(items.map((item) => item.date)).size).toBeGreaterThanOrEqual(2);
    });

    it('passes every Monobank item rule and has no item the provider would skip', () => {
      const problems: string[] = [];
      const seen = new Set<string>();
      defaultFixture.forEach((value, index) => {
        if (!isItem(value)) {
          problems.push(`${index}: not an object`);
          return;
        }
        const { currencyCodeA: a, currencyCodeB: b, date } = value;
        if (!Number.isInteger(a) || !Number.isInteger(b)) {
          problems.push(`${index}: codes are not integers`);
        }
        if (!Number.isInteger(date) || (date as number) <= 0) {
          problems.push(`${index}: date is not a positive integer`);
        }
        const rates = ['rateBuy', 'rateSell', 'rateCross'].filter(
          (field) => value[field] !== undefined,
        );
        if (rates.length === 0) {
          problems.push(`${index}: no rate`);
        }
        for (const field of rates) {
          const rate = value[field];
          if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
            problems.push(`${index}: ${field} is not a finite number > 0`);
          }
        }
        for (const code of [a, b]) {
          if (!SUPPORTED_NUMERIC_CODES.has(code as number)) {
            problems.push(`${index}: code ${String(code)} has no alpha mapping`);
          }
        }
        if (a === b) {
          problems.push(`${index}: same currency on both sides`);
        }
        const pair = `${String(a)}/${String(b)}`;
        if (seen.has(pair)) {
          problems.push(`${index}: duplicate pair ${pair}`);
        }
        seen.add(pair);
      });

      expect(problems).toEqual([]);
    });

    it('serves byte-identical default bodies after resets taken two seconds apart', async () => {
      await delay(2000);
      await reset();

      expect((await getCurrency()).text).toBe(defaultText);
    });
  });

  describe('invalid admin input', () => {
    it('rejects an unknown or missing mode with 400 and an error message, keeping the previous mode', async () => {
      await setMode('http429');
      const bodies = [
        '{"mode":"HTTP500"}',
        '{"mode":"slow"}',
        '{}',
        'not json',
        '{"mode":null}',
        '[]',
        '',
      ];

      const answers: { body: string; status: number; json: unknown }[] = [];
      for (const body of bodies) {
        const response = await postAdmin('/__admin/mode', body);
        answers.push({ body, status: response.status, json: response.json });
      }

      expect(answers).toEqual(bodies.map((body) => ({ body, status: 400, json: NON_EMPTY_ERROR })));
      expect((await state()).mode).toBe('http429');
      expect((await getCurrency()).status).toBe(429);
    });

    it('rejects a fixture that is not a JSON array with 400 and an error message, keeping the previous fixture', async () => {
      await setFixture(F_EXAMPLE);
      const bodies = ['{}', '"x"', 'not json', 'null', '42'];

      const answers: { body: string; status: number; json: unknown }[] = [];
      for (const body of bodies) {
        const response = await postAdmin('/__admin/fixture', body);
        answers.push({ body, status: response.status, json: response.json });
      }

      expect(answers).toEqual(bodies.map((body) => ({ body, status: 400, json: NON_EMPTY_ERROR })));
      expect((await state()).fixtureItems).toBe(2);
      expect(JSON.parse((await getCurrency()).text)).toEqual(F_EXAMPLE);
    });

    it('accepts an empty fixture and serves [] in mode ok', async () => {
      const response = await postAdmin('/__admin/fixture', '[]');
      const served = await getCurrency();

      expect(response.status).toBe(200);
      expect(response.json).toMatchObject({ fixtureItems: 0 });
      expect(served.status).toBe(200);
      expect(JSON.parse(served.text)).toEqual([]);
    });

    it('serves items that break the Monobank item rules unchanged', async () => {
      const response = await postAdmin('/__admin/fixture', JSON.stringify(F_BROKEN));
      const served = await getCurrency();

      expect(response.status).toBe(200);
      expect(response.json).toMatchObject({ fixtureItems: 5 });
      expect(JSON.parse(served.text)).toEqual(F_BROKEN);
    });

    it('answers 404 to unknown paths and methods without counting them', async () => {
      const probes: [string, string][] = [
        ['GET', '/bank/other'],
        ['POST', '/bank/currency'],
        ['GET', '/'],
        ['GET', '/__admin/mode'],
        ['PUT', '/__admin/fixture'],
      ];

      const statuses: string[] = [];
      for (const [method, path] of probes) {
        const response = await mockRequest(method, path);
        statuses.push(`${method} ${path} ${response.status}`);
      }

      expect(statuses).toEqual(probes.map(([method, path]) => `${method} ${path} 404`));
      expect((await state()).requests).toBe(0);
    });
  });

  describe('connections', () => {
    it('keeps serving without restarting after waiting clients disconnect in mode timeout', async () => {
      const before = await containerInfo('monobank-mock', { env: TEST_STACK_ENV });
      await setMode('timeout');

      for (let client = 0; client < 3; client++) {
        await withHeld(() => delay(1000));
      }
      const afterDisconnects = await state();
      await setMode('ok');
      const served = await getCurrency();
      const after = await containerInfo('monobank-mock', { env: TEST_STACK_ENV });

      expect(afterDisconnects.requests).toBe(3);
      expect(served.status).toBe(200);
      expect(JSON.parse(served.text)).toEqual(defaultFixture);
      expect({ startedAt: after.startedAt, restartCount: after.restartCount }).toEqual({
        startedAt: before.startedAt,
        restartCount: before.restartCount,
      });
    }, 30_000);

    it('answers a new request with 200 within 1 second after switching from timeout to ok while a request is held', async () => {
      await setMode('timeout');

      await withHeld(async () => {
        await setMode('ok');
        const served = await getCurrency(1000);

        expect(served.status).toBe(200);
        expect(JSON.parse(served.text)).toEqual(defaultFixture);
        expect(served.elapsedMs).toBeLessThan(1000);
      });
    });

    it('answers 20 concurrent requests with 200 and the fixture, and counts all 20', async () => {
      const responses = await Promise.all(Array.from({ length: 20 }, () => getCurrency()));

      expect(responses.map((response) => response.status)).toEqual(Array(20).fill(200));
      for (const response of responses) {
        expect(JSON.parse(response.text)).toEqual(defaultFixture);
      }
      expect((await state()).requests).toBe(20);
    });
  });
});
