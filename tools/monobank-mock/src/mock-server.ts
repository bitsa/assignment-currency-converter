import http from 'node:http';
import { parseFixture } from './fixture';
import type { Fixture } from './fixture';
import { MOCK_MODES, isMockMode } from './mock-mode';
import { MockState } from './mock-state';

export const MOCK_PORT = 8081;

/** Large enough for a fixture over the provider's 1 MiB body limit. */
export const MAX_ADMIN_BODY_BYTES = 10_485_760;

/** A truncated array: served with 200 and `application/json`, but never parses. */
export const MALFORMED_BODY = '[{"currencyCodeA":840,"currencyCodeB":980,';

const JSON_TYPE = { 'content-type': 'application/json' };

/**
 * A mock of `GET /bank/currency` with an admin API to switch failure modes, swap the fixture,
 * read the request counter and reset. Returned not yet listening.
 */
export function createMockServer(defaultFixture: Fixture): http.Server {
  const state = new MockState(defaultFixture);
  // Responses held open in mode `timeout`; each leaves the set when its client disconnects.
  const held = new Set<http.ServerResponse>();

  function send(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, JSON_TYPE).end(typeof body === 'string' ? body : JSON.stringify(body));
  }

  function serveCurrency(res: http.ServerResponse): void {
    state.recordRequest();
    switch (state.mode) {
      case 'ok':
        return send(res, 200, state.fixture.text);
      case 'http500':
        return send(res, 500, { errorDescription: 'Internal server error' });
      case 'http429':
        return send(res, 429, { errorDescription: 'Too many requests' });
      case 'malformed':
        return send(res, 200, MALFORMED_BODY);
      case 'empty':
        return send(res, 200, '[]');
      case 'timeout':
        held.add(res);
        res.on('close', () => held.delete(res));
        return;
    }
  }

  async function serveAdmin(
    method: string,
    path: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (method === 'GET' && path === '/__admin/state') {
      return send(res, 200, state.view());
    }
    if (
      method !== 'POST' ||
      !['/__admin/mode', '/__admin/fixture', '/__admin/reset'].includes(path)
    ) {
      return send(res, 404, { error: 'not found' });
    }
    const body = await readBody(req);
    if (body === undefined) {
      return send(res, 400, { error: `body exceeds ${MAX_ADMIN_BODY_BYTES} bytes` });
    }
    if (path === '/__admin/reset') {
      state.reset();
      return send(res, 200, state.view());
    }
    if (path === '/__admin/mode') {
      const mode = readMode(body);
      if (mode === undefined) {
        return send(res, 400, { error: `mode must be one of ${MOCK_MODES.join(', ')}` });
      }
      state.setMode(mode);
      return send(res, 200, state.view());
    }
    const fixture = parseFixture(body);
    if (fixture === undefined) {
      return send(res, 400, { error: 'fixture must be a JSON array' });
    }
    state.setFixture(fixture);
    return send(res, 200, state.view());
  }

  return http.createServer((req, res) => {
    const method = req.method ?? 'GET';
    const path = new URL(req.url ?? '/', 'http://mock').pathname;
    if (path === '/bank/currency') {
      return method === 'GET' ? serveCurrency(res) : send(res, 404, { error: 'not found' });
    }
    if (path.startsWith('/__admin/')) {
      serveAdmin(method, path, req, res).catch(() => {
        if (!res.headersSent) {
          send(res, 400, { error: 'could not read the request body' });
        }
      });
      return;
    }
    send(res, 404, { error: 'not found' });
  });
}

/** The body as UTF-8, or `undefined` when it exceeds the cap (the rest is drained). */
async function readBody(req: http.IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    bytes += buffer.length;
    if (bytes <= MAX_ADMIN_BODY_BYTES) {
      chunks.push(buffer);
    }
  }
  return bytes > MAX_ADMIN_BODY_BYTES ? undefined : Buffer.concat(chunks).toString('utf8');
}

function readMode(body: string): ReturnType<typeof modeOf> {
  try {
    return modeOf(JSON.parse(body));
  } catch {
    return undefined;
  }
}

function modeOf(parsed: unknown): (typeof MOCK_MODES)[number] | undefined {
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const mode = (parsed as { mode?: unknown }).mode;
  return isMockMode(mode) ? mode : undefined;
}
