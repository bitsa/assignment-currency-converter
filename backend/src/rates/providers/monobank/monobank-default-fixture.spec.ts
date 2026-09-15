import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import nock from 'nock';
import fixture from '../../../../../tools/monobank-mock/fixtures/default.json';
import { MonobankRateProvider } from './monobank-rate.provider';

const ORIGIN = 'http://monobank-mock.test';

describe("the mock's default fixture", () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("turns the mock's default fixture into one rate per item without skipping any", async () => {
    nock(ORIGIN).get('/bank/currency').reply(200, JSON.stringify(fixture));
    const warn = jest.fn();
    const provider = new MonobankRateProvider(
      new HttpService(axios.create()),
      { baseUrl: ORIGIN, timeoutMs: 1000 },
      { warn },
    );

    const snapshot = await provider.getRates();

    expect(snapshot.rates).toHaveLength(fixture.length);
    expect(warn).not.toHaveBeenCalled();
  });
});
