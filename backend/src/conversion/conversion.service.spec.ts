import { CurrencyCode } from '../currency/currency-code';
import { InvalidAmountError } from '../currency/errors/invalid-amount.error';
import { JsonNumber } from '../currency/json-number';
import { Money } from '../currency/money';
import { UpstreamHttpError } from '../rates/providers/errors/upstream-http.error';
import type { RateSnapshot } from '../rates/rate.types';
import type { RateSource, RatesResult } from '../rates/rates-result.types';
import type { RatesService } from '../rates/rates.service';
import {
  DEFAULT_FETCHED_AT,
  defaultFixtureSnapshot,
  fixtureQuotesWith,
  snapshotOf,
} from '../testing/rate-snapshots';
import { ConversionService } from './conversion.service';
import type { ConversionResult } from './conversion.types';
import { ConversionError } from './errors/conversion.error';
import { RateLegSelector } from './legs/rate-leg-selector';
import { ConversionPathResolver } from './path/conversion-path-resolver';

const LATE = '2026-09-11T08:00:00.000Z';
const EARLY = '2026-09-11T05:00:00.000Z';
const LIMIT_MESSAGE = 'amount exceeds the conversion limit of 4500000.00 UAH';

function serviceWith(
  snapshot: RateSnapshot = defaultFixtureSnapshot(),
  source: RateSource = 'live',
): { readonly service: ConversionService; readonly getRates: jest.Mock<Promise<RatesResult>, []> } {
  const getRates = jest.fn<Promise<RatesResult>, []>().mockResolvedValue({ snapshot, source });
  // Only getRates() is used by the service.
  const rates = { getRates } as unknown as RatesService;
  const selector = new RateLegSelector();
  return {
    service: new ConversionService(rates, new ConversionPathResolver(selector), selector),
    getRates,
  };
}

async function convert(
  amount: string,
  from: string,
  to: string,
  snapshot?: RateSnapshot,
): Promise<ConversionResult> {
  const source = CurrencyCode.of(from);
  return serviceWith(snapshot).service.convert({
    from: source,
    to: CurrencyCode.of(to),
    amount: Money.parseClientAmount(new JsonNumber(amount), source),
  });
}

async function failure(
  amount: string,
  from: string,
  to: string,
  snapshot?: RateSnapshot,
): Promise<unknown> {
  return convert(amount, from, to, snapshot).then(
    () => undefined,
    (error: unknown) => error,
  );
}

function summary(result: ConversionResult): Record<string, unknown> {
  return {
    convertedAmount: result.convertedAmount.toFixed(),
    rate: result.rate.toFixed(),
    path: result.path.map((code) => code.value),
  };
}

function limitMessage(error: unknown): string | undefined {
  return error instanceof InvalidAmountError ? error.message : undefined;
}

const USD_AT_45 = snapshotOf(
  fixtureQuotesWith('USD', 'UAH', { buy: '45', sell: '46', asOf: LATE }),
);
const GBP_AT_45 = snapshotOf(fixtureQuotesWith('GBP', 'UAH', { cross: '45', asOf: EARLY }));
const ONLY_EUR_USD = snapshotOf([
  { base: 'EUR', quote: 'USD', buy: '1.156', sell: '1.172', asOf: LATE },
]);

describe('ConversionService.convert', () => {
  it('converts EUR to GBP in two legs, buying EUR at 47.9 and selling GBP at cross 55.4', async () => {
    const result = await convert('100', 'EUR', 'GBP');

    expect(summary(result)).toEqual({
      convertedAmount: '86.46',
      rate: '0.864621',
      path: ['EUR', 'UAH', 'GBP'],
    });
    expect(result.convertedAmount.currency.value).toBe('GBP');
    expect(result.amount.toFixed()).toBe('100.00');
  });

  it("converts 100 EUR to UAH on the direct quote's buy rate to 4790", async () => {
    expect(summary(await convert('100', 'EUR', 'UAH'))).toEqual({
      convertedAmount: '4790.00',
      rate: '47.9',
      path: ['EUR', 'UAH'],
    });
  });

  it('converts 100 UAH to EUR by dividing by the EUR/UAH sell rate to 2.05 at rate 0.020534', async () => {
    expect(summary(await convert('100', 'UAH', 'EUR'))).toEqual({
      convertedAmount: '2.05',
      rate: '0.020534',
      path: ['UAH', 'EUR'],
    });
  });

  it('converts 100 USD to EUR on the inverse EUR/USD quote to 85.32, not via UAH', async () => {
    const result = await convert('100', 'USD', 'EUR');

    expect(summary(result)).toEqual({
      convertedAmount: '85.32',
      rate: '0.853242',
      path: ['USD', 'EUR'],
    });
    expect(result.convertedAmount.toFixed()).not.toBe('84.39');
  });

  it('converts 100 EUR to USD on the direct EUR/USD buy rate to 115.6', async () => {
    expect(summary(await convert('100', 'EUR', 'USD'))).toEqual({
      convertedAmount: '115.60',
      rate: '1.156',
      path: ['EUR', 'USD'],
    });
  });

  it('converts 100 UAH to GBP with the GBP/UAH cross rate to 1.81', async () => {
    expect(summary(await convert('100', 'UAH', 'GBP'))).toEqual({
      convertedAmount: '1.81',
      rate: '0.018051',
      path: ['UAH', 'GBP'],
    });
  });

  it('converts 100 GBP to EUR via UAH to 113.76 at rate 1.137577', async () => {
    expect(summary(await convert('100', 'GBP', 'EUR'))).toEqual({
      convertedAmount: '113.76',
      rate: '1.137577',
      path: ['GBP', 'UAH', 'EUR'],
    });
  });

  it('rounds to whole units for JPY: 100 UAH to 356 JPY and 100 CHF to 18280 JPY', async () => {
    expect(summary(await convert('100', 'UAH', 'JPY'))).toEqual({
      convertedAmount: '356',
      rate: '3.557453',
      path: ['UAH', 'JPY'],
    });
    expect(summary(await convert('100', 'CHF', 'JPY'))).toEqual({
      convertedAmount: '18280',
      rate: '182.803984',
      path: ['CHF', 'UAH', 'JPY'],
    });
  });

  it('rounds a result exactly halfway half-even: 1 EUR to 0.12 UAH and 3 EUR to 0.38 UAH at buy 0.125', async () => {
    const snapshot = snapshotOf(
      fixtureQuotesWith('EUR', 'UAH', { buy: '0.125', sell: '0.13', asOf: LATE }),
    );

    expect((await convert('1', 'EUR', 'UAH', snapshot)).convertedAmount.toFixed()).toBe('0.12');
    expect((await convert('3', 'EUR', 'UAH', snapshot)).convertedAmount.toFixed()).toBe('0.38');
  });

  it('sets rateDate to the oldest asOf among the quotes on the route', async () => {
    expect((await convert('100', 'EUR', 'GBP')).rateDate.toISOString()).toBe(EARLY);
    expect((await convert('100', 'EUR', 'UAH')).rateDate.toISOString()).toBe(LATE);
  });

  it("sets rateDate to the snapshot's fetchedAt and rate to 1 when from equals to", async () => {
    const result = await convert('100', 'EUR', 'EUR');

    expect(summary(result)).toEqual({ convertedAmount: '100.00', rate: '1', path: ['EUR'] });
    expect(result.rateDate.toISOString()).toBe(DEFAULT_FETCHED_AT.toISOString());
  });

  it('does not date a conversion by the quote used only to value the limit', async () => {
    // USD→EUR is direct on EUR/USD (08:00); the USD/UAH valuation quote is older here.
    const snapshot = snapshotOf(
      fixtureQuotesWith('USD', 'UAH', { buy: '41.1', sell: '41.6', asOf: EARLY }),
    );

    expect((await convert('100', 'USD', 'EUR', snapshot)).rateDate.toISOString()).toBe(LATE);
  });

  it('reports the source of the rates it used', async () => {
    const { service } = serviceWith(defaultFixtureSnapshot(), 'cache');
    const eur = CurrencyCode.of('EUR');

    const result = await service.convert({
      from: eur,
      to: eur,
      amount: Money.parseClientAmount('1', eur),
    });

    expect(result.source).toBe('cache');
  });

  it('passes an upstream failure through unchanged', async () => {
    const { service, getRates } = serviceWith();
    const upstream = new UpstreamHttpError(500);
    getRates.mockRejectedValue(upstream);
    const eur = CurrencyCode.of('EUR');

    await expect(
      service.convert({ from: eur, to: eur, amount: Money.parseClientAmount('1', eur) }),
    ).rejects.toBe(upstream);
  });

  it('allows a UAH amount of exactly 4500000.00', async () => {
    expect((await convert('4500000.00', 'UAH', 'EUR')).convertedAmount.toFixed()).toBe('92402.46');
  });

  it('rejects a UAH amount of 4500000.01 with the conversion limit message', async () => {
    expect(limitMessage(await failure('4500000.01', 'UAH', 'EUR'))).toBe(LIMIT_MESSAGE);
  });

  it('allows 100000.00 USD at buy 45, worth exactly the limit', async () => {
    expect((await convert('100000.00', 'USD', 'EUR', USD_AT_45)).path).toHaveLength(2);
    expect(limitMessage(await failure('100000.01', 'USD', 'EUR', USD_AT_45))).toBe(LIMIT_MESSAGE);
  });

  it('rejects 109489.06 USD at buy 41.1 as above the conversion limit', async () => {
    expect(limitMessage(await failure('109489.06', 'USD', 'GBP'))).toBe(LIMIT_MESSAGE);
    await expect(convert('109489.05', 'USD', 'GBP')).resolves.toBeDefined();
  });

  it('allows 100000.00 GBP at cross 45, worth exactly the limit', async () => {
    await expect(convert('100000.00', 'GBP', 'EUR', GBP_AT_45)).resolves.toBeDefined();
    expect(limitMessage(await failure('100000.01', 'GBP', 'EUR', GBP_AT_45))).toBe(LIMIT_MESSAGE);
  });

  it('rejects 81227.44 GBP at cross 55.4 as above the conversion limit', async () => {
    expect(limitMessage(await failure('81227.44', 'GBP', 'USD'))).toBe(LIMIT_MESSAGE);
    await expect(convert('81227.43', 'GBP', 'USD')).resolves.toBeDefined();
  });

  it('values a USD to EUR amount with the USD/UAH buy rate for the limit although the route is direct', async () => {
    expect(limitMessage(await failure('109489.06', 'USD', 'EUR'))).toBe(LIMIT_MESSAGE);
    const allowed = await convert('109489.05', 'USD', 'EUR');
    expect(allowed.path.map((code) => code.value)).toEqual(['USD', 'EUR']);
  });

  it('rejects UAH to UAH above the limit with the limit message', async () => {
    expect(limitMessage(await failure('4500000.01', 'UAH', 'UAH'))).toBe(LIMIT_MESSAGE);
    await expect(convert('4500000.00', 'UAH', 'UAH')).resolves.toBeDefined();
  });

  it('allows 16008537 JPY and rejects 16008538 JPY at cross 0.2811', async () => {
    await expect(convert('16008537', 'JPY', 'UAH')).resolves.toBeDefined();
    expect(limitMessage(await failure('16008538', 'JPY', 'UAH'))).toBe(LIMIT_MESSAGE);
  });

  it('converts 100000 USD at buy 45 to exactly 4500000 UAH', async () => {
    expect((await convert('100000', 'USD', 'UAH', USD_AT_45)).convertedAmount.toFixed()).toBe(
      '4500000.00',
    );
  });

  it('throws a conversion error for EUR to USD when EUR has no UAH quote to value the limit', async () => {
    const error = await failure('100', 'EUR', 'USD', ONLY_EUR_USD);

    expect(error).toBeInstanceOf(ConversionError);
    expect((error as ConversionError).message).toBe('no exchange rate available from EUR to USD');
  });

  it('throws a conversion error for RUB to RUB when RUB has no UAH quote', async () => {
    const error = await failure('100', 'RUB', 'RUB');

    expect(error).toBeInstanceOf(ConversionError);
    expect((error as ConversionError).message).toBe('no exchange rate available from RUB to RUB');
  });

  it('checks the route before the limit', async () => {
    const error = await failure('99999999', 'EUR', 'RUB');

    expect(error).toBeInstanceOf(ConversionError);
  });

  it('returns convertedAmount 0 and rate 0.000002 when the result is below the smallest unit', async () => {
    const snapshot = snapshotOf(fixtureQuotesWith('JPY', 'UAH', { cross: '0.0001', asOf: EARLY }));

    const result = await convert('1000', 'JPY', 'USD', snapshot);

    expect(summary(result)).toEqual({
      convertedAmount: '0.00',
      rate: '0.000002',
      path: ['JPY', 'UAH', 'USD'],
    });
    expect(result.convertedAmount.amount.isZero()).toBe(true);
  });
});

describe('ConversionService.listCurrencies', () => {
  it('lists UAH and every code quoted against UAH, sorted, for the default fixture', async () => {
    const result = await serviceWith().service.listCurrencies();

    expect(result.currencies.map((code) => code.value)).toEqual([
      'CHF',
      'CZK',
      'EUR',
      'GBP',
      'JPY',
      'PLN',
      'UAH',
      'USD',
    ]);
    expect(result.source).toBe('live');
  });

  it('sets the currency list rateDate to the oldest asOf among the UAH quotes', async () => {
    const snapshot = snapshotOf([
      { base: 'USD', quote: 'UAH', buy: '41.1', sell: '41.6', asOf: LATE },
      { base: 'EUR', quote: 'USD', buy: '1.156', asOf: '2026-09-10T00:00:00.000Z' },
      { base: 'GBP', quote: 'UAH', cross: '55.4', asOf: EARLY },
    ]);

    expect((await serviceWith().service.listCurrencies()).rateDate.toISOString()).toBe(EARLY);
    expect((await serviceWith(snapshot).service.listCurrencies()).rateDate.toISOString()).toBe(
      EARLY,
    );
  });

  it('lists only UAH plus the UAH-quoted codes of a different snapshot, leaving out non-UAH pairs', async () => {
    const snapshot = snapshotOf([
      { base: 'USD', quote: 'UAH', buy: '41.1', sell: '41.6', asOf: LATE },
      { base: 'UAH', quote: 'KZT', cross: '11.9', asOf: LATE },
      { base: 'EUR', quote: 'USD', buy: '1.156', sell: '1.172', asOf: LATE },
      { base: 'GBP', quote: 'PLN', cross: '4.9', asOf: LATE },
      { base: 'AUD', quote: 'UAH', cross: '27.1', asOf: LATE },
    ]);

    const result = await serviceWith(snapshot, 'cache').service.listCurrencies();

    expect(result.currencies.map((code) => code.value)).toEqual(['AUD', 'KZT', 'UAH', 'USD']);
    expect(result.source).toBe('cache');
  });

  it("lists only UAH with the snapshot's fetchedAt as rateDate when no code is quoted against UAH", async () => {
    const result = await serviceWith(ONLY_EUR_USD).service.listCurrencies();

    expect(result.currencies.map((code) => code.value)).toEqual(['UAH']);
    expect(result.rateDate.toISOString()).toBe(DEFAULT_FETCHED_AT.toISOString());
  });

  it('passes an upstream failure through unchanged', async () => {
    const { service, getRates } = serviceWith();
    const upstream = new UpstreamHttpError(429);
    getRates.mockRejectedValue(upstream);

    await expect(service.listCurrencies()).rejects.toBe(upstream);
  });
});
