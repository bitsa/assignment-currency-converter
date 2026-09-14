import { BASE_URL, get, send, type HttpResponse, type Method } from './helpers/http';

// Precondition: the main stack is up and healthy.
function notFoundShape(label: string, response: HttpResponse): Record<string, unknown> {
  const body = (response.body ?? {}) as { statusCode?: unknown; message?: unknown };
  return {
    request: label,
    status: response.status,
    contentType: response.headers['content-type'],
    statusCode: body.statusCode,
    nonEmptyMessage: typeof body.message === 'string' && body.message !== '',
  };
}

const NOT_FOUND = {
  status: 404,
  contentType: expect.stringMatching(/^application\/json/) as unknown,
  statusCode: 404,
  nonEmptyMessage: true,
};

async function expectNotFound(requests: readonly (readonly [Method, string])[]): Promise<void> {
  for (const [method, path] of requests) {
    const label = `${method} ${path}`;
    expect(notFoundShape(label, await send(BASE_URL, method, path))).toEqual({
      request: label,
      ...NOT_FOUND,
    });
  }
}

describe('routing and API documentation', () => {
  it('answers 404 to GET /api/health because /health is outside the api prefix', async () => {
    expect((await get(BASE_URL, '/api/health')).status).toBe(404);
  });

  it('serves Swagger UI as HTML at GET /api/docs', async () => {
    const response = await get(BASE_URL, '/api/docs');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.text).toContain('swagger-ui');
  });

  it('serves an OpenAPI 3 JSON document at GET /api/docs-json', async () => {
    const response = await get(BASE_URL, '/api/docs-json');

    expect(response.status).toBe(200);
    expect((response.body as { openapi?: unknown }).openapi).toMatch(/^3\./);
  });

  it('answers unknown routes with 404 and a JSON body carrying statusCode and a message', async () => {
    await expectNotFound([
      ['GET', '/api/nope'],
      ['GET', '/nope'],
      ['GET', '/'],
    ]);
  });

  it('answers a method no route serves on an existing path with the same 404 JSON body', async () => {
    await expectNotFound([
      ['POST', '/health'],
      ['DELETE', '/api/docs'],
      ['PUT', '/api/docs-json'],
      ['PATCH', '/'],
    ]);
  });
});
