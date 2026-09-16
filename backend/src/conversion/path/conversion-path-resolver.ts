import { Injectable } from '@nestjs/common';
import { ConversionError } from '../errors/conversion.error';
import { RateLegSelector } from '../legs/rate-leg-selector';
import type { ConversionPathHandler } from './conversion-path-handler';
import type { ConversionRoute, RouteRequest } from './conversion-route.types';
import { DirectQuoteHandler } from './direct-quote.handler';
import { InverseQuoteHandler } from './inverse-quote.handler';
import { SameCurrencyHandler } from './same-currency.handler';
import { ViaUahHandler } from './via-uah.handler';

/**
 * Route finding as a Chain of Responsibility: same currency → direct quote → inverse quote →
 * two legs via UAH. The first link that finds a usable route wins.
 */
@Injectable()
export class ConversionPathResolver {
  private readonly chain: ConversionPathHandler;

  constructor(selector: RateLegSelector) {
    this.chain = new SameCurrencyHandler();
    this.chain
      .setNext(new DirectQuoteHandler(selector))
      .setNext(new InverseQuoteHandler(selector))
      .setNext(new ViaUahHandler(selector));
  }

  /** @throws ConversionError when no link yields a route */
  resolve(request: RouteRequest): ConversionRoute {
    const route = this.chain.resolve(request);
    if (route === undefined) {
      throw new ConversionError(request.from, request.to);
    }
    return route;
  }
}
