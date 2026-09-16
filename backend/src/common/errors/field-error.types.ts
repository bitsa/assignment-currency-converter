/** One broken rule in a request, as listed in the error envelope's `details`. */
export interface FieldError {
  /** `from`, `to`, `amount`, an unknown key as sent, or `body` for the request as a whole. */
  readonly field: string;
  readonly message: string;
}
