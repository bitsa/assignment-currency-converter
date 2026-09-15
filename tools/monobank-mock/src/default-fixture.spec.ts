import fixture from '../fixtures/default.json';

interface Item {
  readonly currencyCodeA: number;
  readonly currencyCodeB: number;
  readonly date: number;
  readonly rateBuy?: number;
  readonly rateSell?: number;
  readonly rateCross?: number;
}

const items: readonly Item[] = fixture;

function find(a: number, b: number): Item | undefined {
  return items.find((item) => item.currencyCodeA === a && item.currencyCodeB === b);
}

describe('default fixture', () => {
  it('contains USD/UAH, EUR/UAH and EUR/USD with rateBuy and rateSell', () => {
    for (const [a, b] of [
      [840, 980],
      [978, 980],
      [978, 840],
    ] as const) {
      expect(find(a, b)).toEqual(
        expect.objectContaining({ rateBuy: expect.any(Number), rateSell: expect.any(Number) }),
      );
    }
  });

  it('contains GBP/UAH and PLN/UAH with only rateCross', () => {
    for (const [a, b] of [
      [826, 980],
      [985, 980],
    ] as const) {
      const item = find(a, b);

      expect(item?.rateCross).toEqual(expect.any(Number));
      expect(item).not.toHaveProperty('rateBuy');
      expect(item).not.toHaveProperty('rateSell');
    }
  });

  it('uses at least two distinct date values', () => {
    expect(new Set(items.map((item) => item.date)).size).toBeGreaterThanOrEqual(2);
  });
});
