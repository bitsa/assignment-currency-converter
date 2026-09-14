import request from 'supertest';
import { createTestApp, type TestApp } from './testing/test-app';

describe('application at LOG_LEVEL silent', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ logLevel: 'silent' });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('writes no log lines at LOG_LEVEL silent', async () => {
    const server = testApp.app.getHttpServer();
    testApp.redis.ping.mockRejectedValue(new Error('Connection is closed.'));

    await request(server).get('/api/nope').expect(404);
    await request(server).get('/api/docs').expect(200);
    await request(server).get('/health').expect(503);
    await new Promise((resolve) => setImmediate(resolve));

    expect(testApp.rawLogLines()).toEqual([]);
  });
});
