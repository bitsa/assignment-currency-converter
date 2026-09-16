import { CurrencyCode } from '../currency/currency-code';
import { DomainDecimal } from '../currency/domain-decimal';
import { createRate } from '../rates/rate.factory';
import type { Rate, RateSnapshot } from '../rates/rate.types';

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

export interface QuoteInput {
  readonly base: string;
  readonly quote: string;
  readonly buy?: string;
  readonly sell?: string;
  readonly cross?: string;
  readonly asOf: string;
}

export const DEFAULT_FETCHED_AT = new Date('2026-09-11T08:00:05.000Z');

const LATE = '2026-09-11T08:00:00.000Z';
const EARLY = '2026-09-11T05:00:00.000Z';

/** The monobank mock's default fixture as domain quotes. */
export const DEFAULT_FIXTURE_QUOTES: readonly QuoteInput[] = Object.freeze([
  { base: 'USD', quote: 'UAH', buy: '41.1', sell: '41.6', asOf: LATE },
  { base: 'EUR', quote: 'UAH', buy: '47.9', sell: '48.7', asOf: LATE },
  { base: 'EUR', quote: 'USD', buy: '1.156', sell: '1.172', asOf: LATE },
  { base: 'GBP', quote: 'UAH', cross: '55.4', asOf: EARLY },
  { base: 'PLN', quote: 'UAH', cross: '11.2345', asOf: EARLY },
  { base: 'CHF', quote: 'UAH', cross: '51.3862', asOf: EARLY },
  { base: 'JPY', quote: 'UAH', cross: '0.2811', asOf: EARLY },
  { base: 'CZK', quote: 'UAH', cross: '1.9534', asOf: EARLY },
]);

/** A frozen snapshot of the given quotes, in order. */
export function snapshotOf(
  quotes: readonly QuoteInput[],
  fetchedAt: Date = DEFAULT_FETCHED_AT,
): RateSnapshot {
  return Object.freeze({
    rates: Object.freeze(quotes.map(rateOf)),
    fetchedAt: new Date(fetchedAt.getTime()),
  });
}

/** The monobank mock's default fixture, fetched at `fetchedAt`. */
export function defaultFixtureSnapshot(fetchedAt: Date = DEFAULT_FETCHED_AT): RateSnapshot {
  return snapshotOf(DEFAULT_FIXTURE_QUOTES, fetchedAt);
}

/** `DEFAULT_FIXTURE_QUOTES` with the quote for `base`/`quote` replaced or removed. */
export function fixtureQuotesWith(
  base: string,
  quote: string,
  replacement: Omit<QuoteInput, 'base' | 'quote'> | undefined,
): QuoteInput[] {
  return DEFAULT_FIXTURE_QUOTES.flatMap((input) => {
    if (input.base !== base || input.quote !== quote) {
      return [input];
    }
    return replacement === undefined ? [] : [{ base, quote, ...replacement }];
  });
}

function rateOf(input: QuoteInput): Rate {
  return createRate({
    base: CurrencyCode.of(input.base),
    quote: CurrencyCode.of(input.quote),
    ...(input.buy === undefined ? {} : { buy: new DomainDecimal(input.buy) }),
    ...(input.sell === undefined ? {} : { sell: new DomainDecimal(input.sell) }),
    ...(input.cross === undefined ? {} : { cross: new DomainDecimal(input.cross) }),
    asOf: new Date(input.asOf),
  });
}
