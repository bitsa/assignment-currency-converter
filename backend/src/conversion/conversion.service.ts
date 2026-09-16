import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { assertWithinConversionLimit } from '../currency/conversion-limit';
import type { CurrencyCode } from '../currency/currency-code';
import { DomainDecimal, guardedDiv, type DomainDecimalValue } from '../currency/domain-decimal';
import type { Money } from '../currency/money';
import { RatesService } from '../rates/rates.service';
import type { RateSnapshot } from '../rates/rate.types';
import { ConversionError } from './errors/conversion.error';
import type { ConversionLeg } from './legs/conversion-leg.types';
import { RateLegSelector } from './legs/rate-leg-selector';
import { SnapshotQuotes } from './legs/snapshot-quotes';
import { ConversionPathResolver } from './path/conversion-path-resolver';
import type { ConversionRoute } from './path/conversion-route.types';
import { PIVOT_CURRENCY } from './path/via-uah.handler';
import type { CurrenciesResult, ConversionCommand, ConversionResult } from './conversion.types';

const RATE_DECIMAL_PLACES = 6;

/** Conversion over the current rate snapshot: route, conversion limit, then arithmetic. */
@Injectable()
export class ConversionService {
  constructor(
    private readonly rates: RatesService,
    private readonly resolver: ConversionPathResolver,
    private readonly selector: RateLegSelector,
  ) {}

  /**
   * @throws UpstreamError when no rates can be served
   * @throws ConversionError when there is no route, or no UAH quote to value the amount
   * @throws InvalidAmountError when the amount is worth more than the conversion limit
   */
  async convert(command: ConversionCommand): Promise<ConversionResult> {
    const { snapshot, source } = await this.rates.getRates();
    const quotes = new SnapshotQuotes(snapshot);
    const { from, to, amount } = command;
    const route = this.resolver.resolve({ quotes, from, to });
    this.assertWithinLimit(quotes, command);

    const unrounded = route.legs.reduce(applyLeg, amount);
    return Object.freeze({
      from,
      to,
      amount,
      convertedAmount: unrounded.round(),
      rate: effectiveRate(route, unrounded, amount),
      path: route.path,
      rateDate: rateDateOf(route.legs, snapshot),
      source,
    });
  }

  /** @throws UpstreamError when no rates can be served */
  async listCurrencies(): Promise<CurrenciesResult> {
    const { snapshot, source } = await this.rates.getRates();
    const codes = new Map<string, CurrencyCode>([[PIVOT_CURRENCY.value, PIVOT_CURRENCY]]);
    let oldest: Date | undefined;
    for (const rate of snapshot.rates) {
      const other = rate.quote.equals(PIVOT_CURRENCY)
        ? rate.base
        : rate.base.equals(PIVOT_CURRENCY)
          ? rate.quote
          : undefined;
      if (other === undefined) {
        continue;
      }
      codes.set(other.value, other);
      oldest = oldest === undefined || rate.asOf < oldest ? rate.asOf : oldest;
    }
    const currencies = [...codes.values()].sort((a, b) => (a.value < b.value ? -1 : 1));
    return Object.freeze({
      currencies: Object.freeze(currencies),
      rateDate: oldest ?? snapshot.fetchedAt,
      source,
    });
  }

  /**
   * The amount is valued with the source's own leg into UAH, whether or not the route passes
   * through UAH; the valuation quote does not date the conversion.
   */
  private assertWithinLimit(quotes: SnapshotQuotes, { from, to, amount }: ConversionCommand): void {
    if (from.equals(PIVOT_CURRENCY)) {
      assertWithinConversionLimit(amount);
      return;
    }
    const intoPivot = this.selector.best(quotes, from, PIVOT_CURRENCY);
    if (intoPivot === undefined) {
      throw new ConversionError(from, to);
    }
    assertWithinConversionLimit(applyLeg(amount, intoPivot));
  }
}

function applyLeg(money: Money, leg: ConversionLeg): Money {
  return leg.operation === 'multiply'
    ? money.multiplyByRate(leg.value, leg.to)
    : money.divideByRate(leg.value, leg.to);
}

function effectiveRate(
  route: ConversionRoute,
  unrounded: Money,
  amount: Money,
): DomainDecimalValue {
  if (route.legs.length === 0) {
    return new DomainDecimal(1);
  }
  return guardedDiv(unrounded.amount, amount.amount).toDecimalPlaces(
    RATE_DECIMAL_PLACES,
    Decimal.ROUND_HALF_EVEN,
  );
}

function rateDateOf(legs: readonly ConversionLeg[], snapshot: RateSnapshot): Date {
  let oldest: Date | undefined;
  for (const { rate } of legs) {
    oldest = oldest === undefined || rate.asOf < oldest ? rate.asOf : oldest;
  }
  return oldest ?? snapshot.fetchedAt;
}
