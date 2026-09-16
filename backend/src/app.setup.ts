import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import type { HttpLogger } from 'pino-http';
import {
  jsonBodyParserOptions,
  translateBodyParserError,
  type JsonBodyParserOptions,
} from './common/http/json-body-parser';
import { HTTP_LOGGER } from './common/logging/logging.tokens';

export const API_PREFIX = 'api';
export const DOCS_PATH = 'api/docs';
export const DOCS_JSON_PATH = 'api/docs-json';

/** Nest's default parsers are off: `configureApp` mounts the JSON parser this API needs. */
export const APP_OPTIONS: NestApplicationOptions = Object.freeze({ bodyParser: false });

/**
 * Order matters: the HTTP logger must be mounted before Swagger registers its Express routes,
 * otherwise documentation requests produce no completion line. The parser error middleware
 * follows the parser directly, so parser failures never reach Nest as raw `SyntaxError`s.
 */
export function configureApp(app: NestExpressApplication): void {
  app.useLogger(app.get(Logger));
  app.flushLogs();
  app.use(app.get<HttpLogger>(HTTP_LOGGER));
  app.useBodyParser<JsonBodyParserOptions>('json', jsonBodyParserOptions());
  app.use(translateBodyParserError);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  setupSwagger(app);
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Currency Converter API')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup(DOCS_PATH, app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: DOCS_JSON_PATH,
  });
}
