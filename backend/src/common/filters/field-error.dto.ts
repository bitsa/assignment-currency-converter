import { ApiProperty } from '@nestjs/swagger';
import type { FieldError } from '../errors/field-error.types';

/** Swagger shape of one `details` entry. */
export class FieldErrorDto implements FieldError {
  @ApiProperty({
    description: '`from`, `to`, `amount`, an unknown field as sent, or `body`',
    example: 'amount',
  })
  readonly field!: string;

  @ApiProperty({ example: 'amount must be a positive number' })
  readonly message!: string;
}
