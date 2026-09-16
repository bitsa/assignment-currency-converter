import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, Validate } from 'class-validator';
import { ClientAmountConstraint } from './client-amount.constraint';
import { SupportedCurrencyConstraint } from './supported-currency.constraint';

/**
 * Body of `POST /api/convert`. Values stay as parsed (strings, `JsonNumber`s); the controller
 * builds the domain command once the rules below have passed.
 */
export class ConvertRequestDto {
  @ApiProperty({
    type: String,
    description: 'Source currency, ISO 4217 alpha code (case-insensitive)',
    example: 'EUR',
  })
  @IsDefined({ message: 'from is required' })
  @Validate(SupportedCurrencyConstraint)
  readonly from!: unknown;

  @ApiProperty({
    type: String,
    description: 'Target currency, ISO 4217 alpha code (case-insensitive)',
    example: 'GBP',
  })
  @IsDefined({ message: 'to is required' })
  @Validate(SupportedCurrencyConstraint)
  readonly to!: unknown;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    description:
      'Positive amount in the source currency: a JSON number or a plain decimal string, with at most the currency’s minor units',
    example: 100,
  })
  @IsDefined({ message: 'amount is required' })
  @Validate(ClientAmountConstraint)
  readonly amount!: unknown;
}
