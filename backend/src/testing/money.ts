import { CurrencyCode, Money } from '../currency';

/** Money with an arbitrary unrounded amount, built through public arithmetic only. */
export function unroundedMoney(amount: string, code: string): Money {
  const currency = CurrencyCode.of(code);
  return Money.parseClientAmount('1', currency).multiplyByRate(amount, currency);
}
