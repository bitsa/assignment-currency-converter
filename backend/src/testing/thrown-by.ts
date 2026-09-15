/**
 * The value `fn` throws, or `undefined`. Lets tests assert the class of errors whose
 * constructor is private, which `toThrow(Class)` does not accept.
 */
export function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
