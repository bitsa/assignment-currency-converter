import { CurrencyCode } from '../../currency/currency-code';
import {
  defaultFixtureSnapshot,
  fixtureQuotesWith,
  snapshotOf,
  type QuoteInput,
} from '../../testing/rate-snapshots';
import { thrownBy } from '../../testing/thrown-by';
import { ConversionError } from '../errors/conversion.error';
import { RateLegSelector } from '../legs/rate-leg-selector';
import { SnapshotQuotes } from '../legs/snapshot-quotes';
import { ConversionPathResolver } from './conversion-path-resolver';
import type { ConversionRoute } from './conversion-route.types';

const AS_OF = '2026-09-11T08:00:00.000Z';
const DEFAULT_QUOTES = new SnapshotQuotes(defaultFixtureSnapshot());

function code(value: string): CurrencyCode {
  return CurrencyCode.of(value);
}

function resolve(
  from: string,
  to: string,
  quotes: SnapshotQuotes = DEFAULT_QUOTES,
  selector: RateLegSelector = new RateLegSelector(),
): ConversionRoute {
  return new ConversionPathResolver(selector).resolve({ quotes, from: code(from), to: code(to) });
}

function describeRoute(route: ConversionRoute): unknown {
  return {
    path: route.path.map((currency) => currency.value),
    legs: route.legs.map((leg) => `${leg.operation} ${leg.value.toFixed()}`),
  };
}

function quotesOf(...inputs: QuoteInput[]): SnapshotQuotes {
  return new SnapshotQuotes(snapshotOf(inputs));
}

describe('ConversionPathResolver', () => {
  it('returns a one-entry path with no legs when from equals to', () => {
    expect(describeRoute(resolve('EUR', 'EUR'))).toEqual({ path: ['EUR'], legs: [] });
    expect(describeRoute(resolve('RUB', 'RUB', quotesOf()))).toEqual({ path: ['RUB'], legs: [] });
  });

  it('uses the direct quote for EUR to UAH and its inverse for UAH to EUR', () => {
    expect(describeRoute(resolve('EUR', 'UAH'))).toEqual({
      path: ['EUR', 'UAH'],
      legs: ['multiply 47.9'],
    });
    expect(describeRoute(resolve('UAH', 'EUR'))).toEqual({
      path: ['UAH', 'EUR'],
      legs: ['divide 48.7'],
    });
  });

  it('routes EUR to GBP through UAH', () => {
    expect(describeRoute(resolve('EUR', 'GBP'))).toEqual({
      path: ['EUR', 'UAH', 'GBP'],
      legs: ['multiply 47.9', 'divide 55.4'],
    });
  });

  it('prefers the inverse of a directly quoted pair over the route through UAH', () => {
    expect(describeRoute(resolve('USD', 'EUR'))).toEqual({
      path: ['USD', 'EUR'],
      legs: ['divide 1.172'],
    });
  });

  it('uses the direct quote when both a pair and its inverse are quoted', () => {
    const quotes = quotesOf(
      { base: 'USD', quote: 'EUR', buy: '0.85', sell: '0.87', asOf: AS_OF },
      { base: 'EUR', quote: 'USD', buy: '1.156', sell: '1.172', asOf: AS_OF },
    );

    expect(describeRoute(resolve('EUR', 'USD', quotes))).toEqual({
      path: ['EUR', 'USD'],
      legs: ['multiply 1.156'],
    });
    expect(describeRoute(resolve('USD', 'EUR', quotes))).toEqual({
      path: ['USD', 'EUR'],
      legs: ['multiply 0.85'],
    });
  });

  it('throws a conversion error naming both codes when no route exists', () => {
    const error = thrownBy(() => resolve('EUR', 'RUB'));

    expect(error).toBeInstanceOf(ConversionError);
    expect((error as ConversionError).message).toBe('no exchange rate available from EUR to RUB');
  });

  it('finds no route UAH to USD when USD/UAH has only a buy rate', () => {
    const quotes = new SnapshotQuotes(
      snapshotOf(fixtureQuotesWith('USD', 'UAH', { buy: '41.1', asOf: AS_OF })),
    );

    const error = thrownBy(() => resolve('UAH', 'USD', quotes));

    expect(error).toBeInstanceOf(ConversionError);
    expect((error as ConversionError).message).toBe('no exchange rate available from UAH to USD');
  });

  it('tries same currency, direct, inverse and via UAH in that order', () => {
    const selector = new RateLegSelector();
    const calls: string[] = [];
    for (const method of ['direct', 'inverse', 'best'] as const) {
      const original = selector[method].bind(selector);
      jest.spyOn(selector, method).mockImplementation((quotes, from, to) => {
        calls.push(`${method} ${from.value}>${to.value}`);
        return original(quotes, from, to);
      });
    }

    resolve('EUR', 'EUR', DEFAULT_QUOTES, selector);
    expect(calls).toEqual([]);

    resolve('GBP', 'EUR', DEFAULT_QUOTES, selector);
    expect(calls).toEqual([
      'direct GBP>EUR',
      'inverse GBP>EUR',
      'best GBP>UAH',
      'direct GBP>UAH',
      'best UAH>EUR',
      'direct UAH>EUR',
      'inverse UAH>EUR',
    ]);
  });
});
