import { CurrencyCode } from '../../../currency/currency-code';
import { numericToAlpha } from '../../../currency/currency-table';
import { DomainDecimal, type DomainDecimalValue } from '../../../currency/domain-decimal';
import { createRate } from '../../rate.factory';
import type { Rate } from '../../rate.types';
import type { MonobankItem } from './monobank-item.types';

export interface SkippedItems {
  readonly count: number;
  /** distinct, first-seen order */
  readonly unknownCodes: readonly number[];
  /** distinct, e.g. `UAH/UAH` */
  readonly sameCurrencyPairs: readonly string[];
  /** distinct, e.g. `USD/UAH` */
  readonly duplicatePairs: readonly string[];
}

export interface MappedRates {
  readonly rates: readonly Rate[];
  readonly skipped: SkippedItems;
}

/**
 * Adapter core: Monobank items → domain rates in upstream order. Unknown codes, same-currency
 * pairs and repeated pairs are skipped (the first pair wins); the quote is kept as published.
 */
export function mapMonobankItems(items: readonly MonobankItem[]): MappedRates {
  const rates: Rate[] = [];
  const keptPairs = new Set<string>();
  const unknownCodes = new Set<number>();
  const sameCurrencyPairs = new Set<string>();
  const duplicatePairs = new Set<string>();
  let skipped = 0;

  for (const item of items) {
    const baseAlpha = numericToAlpha(item.currencyCodeA);
    const quoteAlpha = numericToAlpha(item.currencyCodeB);
    if (baseAlpha === undefined || quoteAlpha === undefined) {
      if (baseAlpha === undefined) unknownCodes.add(item.currencyCodeA);
      if (quoteAlpha === undefined) unknownCodes.add(item.currencyCodeB);
      skipped++;
      continue;
    }
    const pair = `${baseAlpha}/${quoteAlpha}`;
    if (baseAlpha === quoteAlpha) {
      sameCurrencyPairs.add(pair);
      skipped++;
      continue;
    }
    if (keptPairs.has(pair)) {
      duplicatePairs.add(pair);
      skipped++;
      continue;
    }
    keptPairs.add(pair);
    rates.push(
      createRate({
        base: CurrencyCode.of(baseAlpha),
        quote: CurrencyCode.of(quoteAlpha),
        ...decimal('buy', item.rateBuy),
        ...decimal('sell', item.rateSell),
        ...decimal('cross', item.rateCross),
        asOf: new Date(item.date * 1000),
      }),
    );
  }

  return {
    rates,
    skipped: {
      count: skipped,
      unknownCodes: [...unknownCodes],
      sameCurrencyPairs: [...sameCurrencyPairs],
      duplicatePairs: [...duplicatePairs],
    },
  };
}

/**
 * `new DomainDecimal(number)` takes the shortest decimal form of the double, so `41.1` stays
 * `41.1` with no binary artefacts.
 */
function decimal<K extends string>(
  key: K,
  value: number | undefined,
): Partial<Record<K, DomainDecimalValue>> {
  return value === undefined
    ? {}
    : ({ [key]: new DomainDecimal(value) } as Record<K, DomainDecimalValue>);
}
