import { ConversionPathHandler } from './conversion-path-handler';
import type { ConversionRoute, RouteRequest } from './conversion-route.types';

/** `from == to`: no leg, rate 1. */
export class SameCurrencyHandler extends ConversionPathHandler {
  protected tryResolve({ from, to }: RouteRequest): ConversionRoute | undefined {
    return from.equals(to)
      ? Object.freeze({ path: Object.freeze([from]), legs: Object.freeze([]) })
      : undefined;
  }
}
