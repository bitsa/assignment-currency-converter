import { UpstreamInvalidResponseError } from '../errors/upstream-invalid-response.error';
import { parseMonobankBody } from './monobank-response.parser';

const VALID_ITEM = '"currencyCodeA":840,"currencyCodeB":980,"date":1789113600,"rateBuy":41.1';

function body(...items: string[]): string {
  return `[${items.join(',')}]`;
}

describe('parseMonobankBody', () => {
  it('ignores fields outside the item rules and keeps the item', () => {
    const items = parseMonobankBody(body(`{${VALID_ITEM},"extra":true}`));

    expect(items).toEqual([
      { currencyCodeA: 840, currencyCodeB: 980, date: 1789113600, rateBuy: 41.1 },
    ]);
  });

  it('rejects a truncated JSON array as an invalid response', () => {
    expect(() => parseMonobankBody(`[{${VALID_ITEM}},`)).toThrow(UpstreamInvalidResponseError);
  });

  it('rejects an empty array [] as an invalid response', () => {
    expect(() => parseMonobankBody('[]')).toThrow(UpstreamInvalidResponseError);
  });

  it.each(['currencyCodeA', 'currencyCodeB', 'date'])(
    'rejects the whole response when an item lacks %s',
    (field) => {
      const item = JSON.parse(`{${VALID_ITEM}}`) as Record<string, unknown>;
      delete item[field];

      expect(() => parseMonobankBody(body(`{${VALID_ITEM}}`, JSON.stringify(item)))).toThrow(
        UpstreamInvalidResponseError,
      );
    },
  );

  it.each(['{"errorDescription":"x"}', 'null', '42', '"text"'])(
    'rejects the non-array JSON body %s as an invalid response',
    (text) => {
      expect(() => parseMonobankBody(text)).toThrow(UpstreamInvalidResponseError);
    },
  );

  it.each(['"840"', '840.5', 'null'])(
    'rejects the whole response when a currency code is %s instead of an integer',
    (code) => {
      const broken = `{"currencyCodeA":${code},"currencyCodeB":980,"date":1789113600,"rateBuy":41.1}`;

      expect(() => parseMonobankBody(body(`{${VALID_ITEM}}`, broken))).toThrow(
        UpstreamInvalidResponseError,
      );
    },
  );

  it.each(['0', '-1', '"1789113600"', '1789113600.5'])(
    'rejects the whole response when date is %s instead of a positive integer',
    (date) => {
      const broken = `{"currencyCodeA":840,"currencyCodeB":980,"date":${date},"rateBuy":41.1}`;

      expect(() => parseMonobankBody(body(broken))).toThrow(UpstreamInvalidResponseError);
    },
  );

  it('rejects the whole response when an item has none of rateBuy, rateSell and rateCross', () => {
    const broken = '{"currencyCodeA":840,"currencyCodeB":980,"date":1789113600}';

    expect(() => parseMonobankBody(body(`{${VALID_ITEM}}`, broken))).toThrow(
      UpstreamInvalidResponseError,
    );
  });

  it.each(['0', '-41.1', '"41.1"', 'null'])(
    'rejects the whole response when a present rate field is %s',
    (value) => {
      const broken = `{"currencyCodeA":840,"currencyCodeB":980,"date":1789113600,"rateBuy":41.1,"rateSell":${value}}`;

      expect(() => parseMonobankBody(body(broken))).toThrow(UpstreamInvalidResponseError);
    },
  );

  it.each(['42', 'null', '[]'])(
    'rejects the whole response when an array element is %s instead of an object',
    (element) => {
      expect(() => parseMonobankBody(body(`{${VALID_ITEM}}`, element))).toThrow(
        UpstreamInvalidResponseError,
      );
    },
  );
});
