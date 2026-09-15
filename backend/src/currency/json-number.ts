/**
 * A JSON number kept as its source text. Parsing it into a double first can drop digits
 * (`0.100000000000000005` becomes `0.1`), which would hide decimals from amount validation.
 */
export class JsonNumber {
  constructor(readonly source: string) {
    Object.freeze(this);
  }

  /** `JSON.parse` reviver that turns every number into a `JsonNumber` of its source text. */
  static reviver(this: void, _key: string, value: unknown, context?: { source?: string }): unknown {
    return typeof value === 'number' && context?.source !== undefined
      ? new JsonNumber(context.source)
      : value;
  }
}
