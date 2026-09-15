import { CurrencyCode } from '../currency/currency-code';
import { DomainDecimal } from '../currency/domain-decimal';
import { createRate } from '../rates/rate.factory';
import type { RateSnapshot } from '../rates/rate.types';

/** USD/UAH buy 41.1 sell 41.6, GBP/UAH cross 55.4 and KRW/UAH cross 0.0272, fetched at `fetchedAt`. */
export function sampleSnapshot(fetchedAt: Date): RateSnapshot {
  const uah = CurrencyCode.of('UAH');
  return Object.freeze({
    rates: Object.freeze([
      createRate({
        base: CurrencyCode.of('USD'),
        quote: uah,
        buy: new DomainDecimal('41.1'),
        sell: new DomainDecimal('41.6'),
        asOf: new Date('2026-09-11T08:00:00.000Z'),
      }),
      createRate({
        base: CurrencyCode.of('GBP'),
        quote: uah,
        cross: new DomainDecimal('55.4'),
        asOf: new Date('2026-09-11T05:00:00.000Z'),
      }),
      createRate({
        base: CurrencyCode.of('KRW'),
        quote: uah,
        cross: new DomainDecimal('0.0272'),
        asOf: new Date('2026-09-11T05:00:00.000Z'),
      }),
    ]),
    fetchedAt: new Date(fetchedAt.getTime()),
  });
}

/** Plain view of a snapshot for equality assertions: codes, decimal strings and ISO timestamps. */
export function describeSnapshot(snapshot: RateSnapshot): unknown {
  return {
    rates: snapshot.rates.map((rate) => ({
      base: rate.base.value,
      quote: rate.quote.value,
      buy: rate.buy?.toFixed(),
      sell: rate.sell?.toFixed(),
      cross: rate.cross?.toFixed(),
      asOf: rate.asOf.toISOString(),
    })),
    fetchedAt: snapshot.fetchedAt.toISOString(),
  };
}
