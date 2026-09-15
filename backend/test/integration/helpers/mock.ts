import http from 'node:http';

/** Host-side address of the Monobank mock in the test stack. */
export const MOCK_URL = process.env.MONOBANK_MOCK_URL ?? 'http://127.0.0.1:8081';

/** Compose environment that loads the test override, so `ps`, `exec` and `config` see the mock. */
export const TEST_STACK_ENV = { COMPOSE_FILE: 'docker-compose.yml:docker-compose.test.yml' };

/** Compose environment for the base stack alone. */
export const BASE_STACK_ENV = { COMPOSE_FILE: 'docker-compose.yml' };

export interface MockResponse {
  readonly status: number;
  readonly contentType: string | undefined;
  readonly text: string;
  /** The parsed body, or `undefined` when the body is not valid JSON. */
  readonly json: unknown;
  readonly elapsedMs: number;
}

export interface MockState {
  readonly mode: string;
  readonly requests: number;
  readonly fixtureItems: number;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Sends a raw request; bodies are read as text so a malformed body never throws. */
export async function mockRequest(
  method: string,
  path: string,
  rawBody?: string,
  contentType = 'application/json',
  timeoutMs = 10_000,
): Promise<MockResponse> {
  const startedAt = Date.now();
  const init: RequestInit = { method, signal: AbortSignal.timeout(timeoutMs) };
  if (rawBody !== undefined) {
    init.body = rawBody;
    init.headers = { 'content-type': contentType };
  }
  const response = await fetch(`${MOCK_URL}${path}`, init);
  const text = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? undefined,
    text,
    json: parseJson(text),
    elapsedMs: Date.now() - startedAt,
  };
}

export function getCurrency(timeoutMs = 10_000): Promise<MockResponse> {
  return mockRequest('GET', '/bank/currency', undefined, undefined, timeoutMs);
}

export function postAdmin(
  path: string,
  rawBody: string,
  contentType = 'application/json',
): Promise<MockResponse> {
  return mockRequest('POST', path, rawBody, contentType);
}

function expectOk(response: MockResponse, action: string): MockResponse {
  if (response.status !== 200) {
    throw new Error(`${action} answered ${response.status}: ${response.text}`);
  }
  return response;
}

export async function setMode(mode: string): Promise<MockResponse> {
  return expectOk(await postAdmin('/__admin/mode', JSON.stringify({ mode })), `mode ${mode}`);
}

export async function setFixture(items: unknown): Promise<MockResponse> {
  return expectOk(await postAdmin('/__admin/fixture', JSON.stringify(items)), 'fixture');
}

export async function reset(): Promise<MockResponse> {
  return expectOk(await postAdmin('/__admin/reset', ''), 'reset');
}

export async function state(): Promise<MockState> {
  const response = expectOk(await mockRequest('GET', '/__admin/state'), 'state');
  return response.json as MockState;
}

export interface HeldRequest {
  /** Whether the TCP connection was accepted. */
  connected(): boolean;
  /** Milliseconds from sending to the status line, or `undefined` if none arrived. */
  respondedAfterMs(): number | undefined;
  /** A socket error seen before `abort()`, if any. */
  error(): Error | undefined;
  /** Disconnects and waits for the socket to close. */
  abort(): Promise<void>;
}

/**
 * Opens a `GET /bank/currency` on its own connection and keeps it open. Resolves once the
 * connection is accepted (or failed), so callers can observe what the mock does with it.
 */
export function holdCurrencyRequest(): Promise<HeldRequest> {
  const target = new URL(MOCK_URL);
  const startedAt = Date.now();
  let connected = false;
  let respondedAfterMs: number | undefined;
  let error: Error | undefined;
  let aborted = false;
  let closed = false;

  const req = http.request({
    host: target.hostname,
    port: target.port,
    path: '/bank/currency',
    method: 'GET',
    agent: false,
  });
  const closedPromise = new Promise<void>((resolve) => {
    req.on('close', () => {
      closed = true;
      resolve();
    });
  });
  req.on('response', (response) => {
    respondedAfterMs = Date.now() - startedAt;
    response.resume();
  });
  req.on('error', (caught) => {
    if (!aborted) {
      error = caught;
    }
  });

  const held: HeldRequest = {
    connected: () => connected,
    respondedAfterMs: () => respondedAfterMs,
    error: () => error,
    abort: async () => {
      aborted = true;
      if (!closed) {
        req.destroy();
      }
      // Bounded, so a missed close event cannot hang the test past its own timeout.
      await Promise.race([closedPromise, new Promise((resolve) => setTimeout(resolve, 2000))]);
    },
  };

  return new Promise((resolve) => {
    // Bounded, so a connection that is never accepted is reported instead of hanging.
    const giveUp = setTimeout(() => resolve(held), 5000);
    req.on('socket', (socket) => {
      socket.on('connect', () => {
        connected = true;
        clearTimeout(giveUp);
        resolve(held);
      });
    });
    req.on('error', () => {
      clearTimeout(giveUp);
      resolve(held);
    });
    req.end();
  });
}
