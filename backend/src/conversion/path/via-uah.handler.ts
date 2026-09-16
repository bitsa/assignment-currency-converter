import { CurrencyCode } from '../../currency/currency-code';
import type { RateLegSelector } from '../legs/rate-leg-selector';
import { ConversionPathHandler } from './conversion-path-handler';
import type { ConversionRoute, RouteRequest } from './conversion-route.types';

export const PIVOT_CURRENCY = CurrencyCode.of('UAH');

/** Two legs through UAH, which Monobank quotes almost every currency against. */
export class ViaUahHandler extends ConversionPathHandler {
  constructor(private readonly selector: RateLegSelector) {
    super();
  }

  protected tryResolve({ quotes, from, to }: RouteRequest): ConversionRoute | undefined {
    if (from.equals(PIVOT_CURRENCY) || to.equals(PIVOT_CURRENCY)) {
      return undefined;
    }
    const intoPivot = this.selector.best(quotes, from, PIVOT_CURRENCY);
    const outOfPivot = intoPivot && this.selector.best(quotes, PIVOT_CURRENCY, to);
    if (intoPivot === undefined || outOfPivot === undefined) {
      return undefined;
    }
    return Object.freeze({
      path: Object.freeze([from, PIVOT_CURRENCY, to]),
      legs: Object.freeze([intoPivot, outOfPivot]),
    });
  }
}
