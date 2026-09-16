import { ValidationPipe } from '@nestjs/common';
import { ValidationError, getMetadataStorage, type ValidatorOptions } from 'class-validator';
import { WHITELIST_CONSTRAINT, notAllowedFieldMessage } from './validation-errors.mapper';

/**
 * class-validator decides whether a key is declared by looking it up in a plain object, so a
 * body key named like an `Object.prototype` member (`hasOwnProperty`, `toString`) passes its
 * whitelist. This pipe reports those keys as unknown too, keeping unknown fields in body order.
 */
export class RequestValidationPipe extends ValidationPipe {
  protected override async validate(
    object: object,
    validatorOptions?: ValidatorOptions,
  ): Promise<ValidationError[]> {
    const errors = await super.validate(object, validatorOptions);
    if (validatorOptions?.forbidNonWhitelisted !== true) {
      return errors;
    }
    const keys = Object.keys(object);
    const declared = declaredProperties(object);
    const reported = new Set(errors.filter(isWhitelistError).map((error) => error.property));
    const missed = keys
      .filter((key) => key in Object.prototype && !declared.has(key) && !reported.has(key))
      .map(notAllowed);
    if (missed.length === 0) {
      return errors;
    }
    const unknown = [...errors.filter(isWhitelistError), ...missed].sort(
      (a, b) => keys.indexOf(a.property) - keys.indexOf(b.property),
    );
    return [...unknown, ...errors.filter((error) => !isWhitelistError(error))];
  }
}

function declaredProperties(object: object): ReadonlySet<string> {
  return new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(object.constructor, '', true, false)
      .map((metadata) => metadata.propertyName),
  );
}

function isWhitelistError(error: ValidationError): boolean {
  return error.constraints?.[WHITELIST_CONSTRAINT] !== undefined;
}

function notAllowed(property: string): ValidationError {
  const error = new ValidationError();
  error.property = property;
  error.children = [];
  error.constraints = { [WHITELIST_CONSTRAINT]: notAllowedFieldMessage(property) };
  return error;
}
