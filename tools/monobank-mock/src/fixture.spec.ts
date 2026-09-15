import { parseFixture } from './fixture';

describe('parseFixture', () => {
  it('keeps the text unchanged and counts the array items', () => {
    const text = '[{"rateBuy":41.10},{"rateCross":55.40}]';

    expect(parseFixture(text)).toEqual({ text, items: 2 });
  });

  it('returns undefined for text that is not JSON or not an array', () => {
    for (const text of ['{}', '"x"', 'not json', '', 'null']) {
      expect(parseFixture(text)).toBeUndefined();
    }
  });
});
