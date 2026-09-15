import { CURRENCY_TABLE, findCurrencyByAlpha, type CurrencyInfo } from './currency-table';
import { UnsupportedCurrencyError } from './errors/unsupported-currency.error';

/** Checked before any case change: `'uſd'.toUpperCase()` is `'USD'`. */
const THREE_ASCII_LETTERS = /^[A-Za-z]{3}$/;

/** A supported ISO 4217 currency in canonical upper-case form. */
export class CurrencyCode {
  private static readonly interned: ReadonlyMap<string, CurrencyCode> = new Map(
    CURRENCY_TABLE.map((info) => [info.alpha, new CurrencyCode(info)]),
  );

  private static readonly ordered: readonly CurrencyCode[] = Object.freeze([
    ...CurrencyCode.interned.values(),
  ]);

  readonly value: string;
  readonly numericCode: number;
  readonly minorUnits: 0 | 2 | 3;
  readonly name: string;

  private constructor(info: CurrencyInfo) {
    this.value = info.alpha;
    this.numericCode = info.numeric;
    this.minorUnits = info.minorUnits;
    this.name = info.name;
    Object.freeze(this);
  }

  static of(input: unknown): CurrencyCode {
    if (typeof input !== 'string') {
      throw new UnsupportedCurrencyError(input);
    }
    const trimmed = input.trim();
    if (!THREE_ASCII_LETTERS.test(trimmed)) {
      throw new UnsupportedCurrencyError(input);
    }
    const info = findCurrencyByAlpha(trimmed.toUpperCase());
    const code = info && CurrencyCode.interned.get(info.alpha);
    if (code === undefined) {
      throw new UnsupportedCurrencyError(input);
    }
    return code;
  }

  static all(): readonly CurrencyCode[] {
    return CurrencyCode.ordered;
  }

  equals(other: CurrencyCode): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
