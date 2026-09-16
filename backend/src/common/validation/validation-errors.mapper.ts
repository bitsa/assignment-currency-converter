import type { ValidationError } from 'class-validator';
import type { FieldError } from '../errors/field-error.types';
import { RequestValidationError } from '../errors/request-validation.error';

/** The constraint name class-validator uses for a property the DTO does not declare. */
export const WHITELIST_CONSTRAINT = 'whitelistValidation';

export function notAllowedFieldMessage(name: string): string {
  return `field ${JSON.stringify(name)} is not allowed`;
}

/**
 * One entry per broken property with its first rule. Declared properties come first, in
 * declaration order; unknown properties follow in body order (class-validator lists them first).
 */
export function toRequestValidationError(
  errors: readonly ValidationError[],
): RequestValidationError {
  const declared: FieldError[] = [];
  const unknown: FieldError[] = [];
  for (const error of errors) {
    const constraints = Object.entries(error.constraints ?? {});
    const first = constraints[0];
    if (first === undefined) {
      continue;
    }
    if (constraints.some(([name]) => name === WHITELIST_CONSTRAINT)) {
      unknown.push({ field: error.property, message: notAllowedFieldMessage(error.property) });
    } else {
      declared.push({ field: error.property, message: first[1] });
    }
  }
  return RequestValidationError.of([...declared, ...unknown]);
}
