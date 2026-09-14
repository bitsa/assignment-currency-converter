import request, { type Test } from 'supertest';

export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
  readonly text: string;
  readonly elapsedMs: number;
}

function start(baseUrl: string, method: Method, path: string): Test {
  const agent = request(baseUrl);
  switch (method) {
    case 'GET':
      return agent.get(path);
    case 'POST':
      return agent.post(path);
    case 'PUT':
      return agent.put(path);
    case 'PATCH':
      return agent.patch(path);
    case 'DELETE':
      return agent.delete(path);
  }
}

export async function send(
  baseUrl: string,
  method: Method,
  path: string,
  timeoutMs = 10_000,
): Promise<HttpResponse> {
  const startedAt = Date.now();
  const response = await start(baseUrl, method, path).timeout(timeoutMs);
  return {
    status: response.status,
    headers: response.headers,
    body: response.body as unknown,
    text: response.text,
    elapsedMs: Date.now() - startedAt,
  };
}

export function get(baseUrl: string, path: string, timeoutMs = 10_000): Promise<HttpResponse> {
  return send(baseUrl, 'GET', path, timeoutMs);
}

/** Like `get`, but resolves `undefined` when no HTTP response arrives (refused, reset, timeout). */
export async function tryGet(
  baseUrl: string,
  path: string,
  timeoutMs = 10_000,
): Promise<HttpResponse | undefined> {
  try {
    return await get(baseUrl, path, timeoutMs);
  } catch {
    return undefined;
  }
}
