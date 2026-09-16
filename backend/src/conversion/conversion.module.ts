import { Module } from '@nestjs/common';
import { RatesModule } from '../rates/rates.module';
import { ConversionService } from './conversion.service';
import { ConvertController } from './convert.controller';
import { RateLegSelector } from './legs/rate-leg-selector';
import { ConversionPathResolver } from './path/conversion-path-resolver';

@Module({
  imports: [RatesModule],
  providers: [RateLegSelector, ConversionPathResolver, ConversionService],
  controllers: [ConvertController],
})
export class ConversionModule {}
