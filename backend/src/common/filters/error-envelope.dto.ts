import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ErrorCode } from '../errors/error-code';
import type { ErrorEnvelope } from './error-envelope.types';
import { FieldErrorDto } from './field-error.dto';

const ERROR_CODES: readonly ErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UNSUPPORTED_MEDIA_TYPE',
  'CONVERSION_ERROR',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'UPSTREAM_UNAVAILABLE',
  'CACHE_UNAVAILABLE',
];

/** Swagger shape of the error envelope. */
export class ErrorEnvelopeDto implements ErrorEnvelope {
  @ApiProperty({ description: 'Equals the HTTP status', example: 400 })
  readonly statusCode!: number;

  @ApiProperty({ enum: ERROR_CODES, example: 'VALIDATION_ERROR' })
  readonly code!: ErrorCode;

  @ApiProperty({ example: 'amount must be a positive number' })
  readonly message!: string;

  @ApiPropertyOptional({
    type: [FieldErrorDto],
    description: 'Present on 400 VALIDATION_ERROR only: one entry per broken field',
  })
  readonly details?: FieldErrorDto[];

  @ApiProperty({ format: 'date-time', example: '2026-09-11T08:00:00.000Z' })
  readonly timestamp!: string;

  @ApiProperty({ description: 'Request path without the query string', example: '/api/convert' })
  readonly path!: string;
}
