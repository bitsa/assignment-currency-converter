/** One item of Monobank's `/bank/currency` array, after validation. */
export interface MonobankItem {
  readonly currencyCodeA: number;
  readonly currencyCodeB: number;
  readonly date: number;
  readonly rateBuy?: number;
  readonly rateSell?: number;
  readonly rateCross?: number;
}
