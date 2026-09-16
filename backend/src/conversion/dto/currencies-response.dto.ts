import { ApiProperty } from '@nestjs/swagger';
import type { RateSource } from '../../rates/rates-result.types';
import { RATE_SOURCES } from './convert-response.dto';

/** Body of `GET /api/currencies`. */
export class CurrenciesResponse {
  @ApiProperty({
    type: [String],
    description: 'UAH and every code quoted against UAH in the current snapshot, ascending',
    example: ['CHF', 'CZK', 'EUR', 'GBP', 'JPY', 'PLN', 'UAH', 'USD'],
  })
  readonly currencies!: string[];

  @ApiProperty({
    format: 'date-time',
    description: 'Oldest time among the listed quotes',
    example: '2026-09-11T05:00:00.000Z',
  })
  readonly rateDate!: string;

  @ApiProperty({ enum: RATE_SOURCES, example: 'cache' })
  readonly source!: RateSource;
}
