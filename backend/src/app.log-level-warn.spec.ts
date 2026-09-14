import request from 'supertest';
import { createTestApp, type TestApp } from './testing/test-app';

describe('application at LOG_LEVEL warn', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ logLevel: 'warn' });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('writes no info-or-lower line for GET /api/docs at LOG_LEVEL warn', async () => {
    testApp.clearLogs();

    await request(testApp.app.getHttpServer()).get('/api/docs').expect(200);
    await new Promise((resolve) => setImmediate(resolve));

    const levels = testApp.logLines().map((line) => line.level);
    expect(levels.filter((level) => ['info', 'debug', 'trace'].includes(level))).toEqual([]);
  });
});
