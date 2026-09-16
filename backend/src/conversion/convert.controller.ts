import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { RequestValidationError } from '../common/errors/request-validation.error';
import { ErrorEnvelopeDto } from '../common/filters/error-envelope.dto';
import { JsonObjectBodyGuard } from '../common/http/json-object-body.guard';
import { CurrencyCode } from '../currency/currency-code';
import { InvalidAmountError } from '../currency/errors/invalid-amount.error';
import { Money } from '../currency/money';
import { ConversionService } from './conversion.service';
import type { ConversionResult, CurrenciesResult } from './conversion.types';
import { ConvertRequestDto } from './dto/convert-request.dto';
import { ConvertResponse } from './dto/convert-response.dto';
import { CurrenciesResponse } from './dto/currencies-response.dto';

@ApiTags('conversion')
@Controller()
export class ConvertController {
  constructor(private readonly conversion: ConversionService) {}

  @Post('convert')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JsonObjectBodyGuard)
  @ApiOkResponse({ type: ConvertResponse, description: 'The converted amount' })
  @ApiBadRequestResponse({
    type: ErrorEnvelopeDto,
    description: 'Invalid body or field, or an amount above the conversion limit',
  })
  @ApiUnsupportedMediaTypeResponse({
    type: ErrorEnvelopeDto,
    description: 'content-type is not application/json',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorEnvelopeDto,
    description: 'No exchange rate available between the two currencies',
  })
  @ApiServiceUnavailableResponse({
    type: ErrorEnvelopeDto,
    description: 'Exchange rates are temporarily unavailable',
  })
  async convert(@Body() body: ConvertRequestDto): Promise<ConvertResponse> {
    // The validation pipe has already checked these values, so the factories cannot fail.
    const from = CurrencyCode.of(body.from);
    const to = CurrencyCode.of(body.to);
    const amount = Money.parseClientAmount(body.amount, from);
    try {
      return toConvertResponse(await this.conversion.convert({ from, to, amount }));
    } catch (error) {
      if (error instanceof InvalidAmountError) {
        throw RequestValidationError.forField('amount', error.message);
      }
      throw error;
    }
  }

  @Get('currencies')
  @ApiOkResponse({ type: CurrenciesResponse, description: 'Codes the service can convert now' })
  @ApiServiceUnavailableResponse({
    type: ErrorEnvelopeDto,
    description: 'Exchange rates are temporarily unavailable',
  })
  async currencies(): Promise<CurrenciesResponse> {
    return toCurrenciesResponse(await this.conversion.listCurrencies());
  }
}

function toConvertResponse(result: ConversionResult): ConvertResponse {
  return {
    from: result.from.value,
    to: result.to.value,
    amount: Number(result.amount.amount.toFixed()),
    convertedAmount: Number(result.convertedAmount.toFixed()),
    rate: Number(result.rate.toFixed()),
    path: result.path.map((code) => code.value),
    rateDate: result.rateDate.toISOString(),
    source: result.source,
  };
}

function toCurrenciesResponse(result: CurrenciesResult): CurrenciesResponse {
  return {
    currencies: result.currencies.map((code) => code.value),
    rateDate: result.rateDate.toISOString(),
    source: result.source,
  };
}
