import { Module } from '@nestjs/common';
import { LoggerModule, type Params } from 'nestjs-pino';
import { pino, type Logger } from 'pino';
import { pinoHttp, type HttpLogger, type Options } from 'pino-http';
import { AppConfigService } from '../../config/app-config.service';
import { buildHttpLoggerOptions, buildRootLoggerOptions } from './logger-options';
import { HTTP_LOGGER, HTTP_LOGGER_OPTIONS, ROOT_LOGGER } from './logging.tokens';

// The HTTP logger is mounted by configureApp at the Express level so that every request,
// including Swagger routes and unmatched paths, gets one completion line. nestjs-pino runs in
// useExisting mode: it only binds req.log into its async context and does not mount a second
// pino-http middleware.
@Module({
  imports: [
    LoggerModule.forRootAsync({
      providers: [
        {
          provide: ROOT_LOGGER,
          inject: [AppConfigService],
          useFactory: (config: AppConfigService): Logger =>
            pino(buildRootLoggerOptions({ nodeEnv: config.nodeEnv, logLevel: config.logLevel })),
        },
        {
          provide: HTTP_LOGGER_OPTIONS,
          inject: [ROOT_LOGGER],
          useFactory: (root: Logger): Options => buildHttpLoggerOptions(root),
        },
        {
          provide: HTTP_LOGGER,
          inject: [HTTP_LOGGER_OPTIONS],
          useFactory: (options: Options): HttpLogger => pinoHttp(options),
        },
      ],
      inject: [HTTP_LOGGER_OPTIONS],
      useFactory: (options: Options): Params => ({ pinoHttp: options, useExisting: true }),
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
