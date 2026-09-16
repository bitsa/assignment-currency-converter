import type { ConversionLeg } from '../legs/conversion-leg.types';
import type { ConversionRoute, RouteRequest } from './conversion-route.types';

/** One link of the route-finding chain: answers with its own route or asks the next link. */
export abstract class ConversionPathHandler {
  private next: ConversionPathHandler | undefined;

  /** Returns `next`, so links can be chained in one expression. */
  setNext(next: ConversionPathHandler): ConversionPathHandler {
    this.next = next;
    return next;
  }

  resolve(request: RouteRequest): ConversionRoute | undefined {
    return this.tryResolve(request) ?? this.next?.resolve(request);
  }

  protected abstract tryResolve(request: RouteRequest): ConversionRoute | undefined;
}

/** A route of one leg, or none. */
export function singleLegRoute(leg: ConversionLeg | undefined): ConversionRoute | undefined {
  return leg === undefined
    ? undefined
    : Object.freeze({ path: Object.freeze([leg.from, leg.to]), legs: Object.freeze([leg]) });
}
