import { ApiProperty } from '@nestjs/swagger';
import type { RateSource } from '../../rates/rates-result.types';

export const RATE_SOURCES: readonly RateSource[] = ['cache', 'live'];

/** Body of a successful `POST /api/convert`. */
export class ConvertResponse {
  @ApiProperty({ example: 'EUR' })
  readonly from!: string;

  @ApiProperty({ example: 'GBP' })
  readonly to!: string;

  @ApiProperty({ example: 100 })
  readonly amount!: number;

  @ApiProperty({
    description: 'Rounded half-even to the target currency’s minor units',
    example: 86.46,
  })
  readonly convertedAmount!: number;

  @ApiProperty({
    description: 'Unrounded converted amount divided by amount, rounded half-even to 6 decimals',
    example: 0.864621,
  })
  readonly rate!: number;

  @ApiProperty({
    type: [String],
    description: 'Currencies visited: [from] when from equals to, three entries via UAH',
    example: ['EUR', 'UAH', 'GBP'],
  })
  readonly path!: string[];

  @ApiProperty({
    format: 'date-time',
    description: 'Oldest quote time on the route; the snapshot time when from equals to',
    example: '2026-09-11T05:00:00.000Z',
  })
  readonly rateDate!: string;

  @ApiProperty({ enum: RATE_SOURCES, example: 'live' })
  readonly source!: RateSource;
}
