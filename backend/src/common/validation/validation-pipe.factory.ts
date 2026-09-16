import { ValidationPipe } from '@nestjs/common';
import { OWN_KEYS_TRANSFORMER } from './own-keys-transformer';
import { toRequestValidationError } from './validation-errors.mapper';

/** The global pipe: DTO rules, unknown fields rejected, first broken rule per field reported. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
    transform: false,
    validationError: { target: false, value: false },
    transformerPackage: OWN_KEYS_TRANSFORMER,
    exceptionFactory: (errors) => toRequestValidationError(errors),
  });
}
