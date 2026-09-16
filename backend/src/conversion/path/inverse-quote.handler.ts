import type { RateLegSelector } from '../legs/rate-leg-selector';
import { ConversionPathHandler, singleLegRoute } from './conversion-path-handler';
import type { ConversionRoute, RouteRequest } from './conversion-route.types';

/** The snapshot quotes `to`/`from`, used in reverse. */
export class InverseQuoteHandler extends ConversionPathHandler {
  constructor(private readonly selector: RateLegSelector) {
    super();
  }

  protected tryResolve({ quotes, from, to }: RouteRequest): ConversionRoute | undefined {
    return singleLegRoute(this.selector.inverse(quotes, from, to));
  }
}
