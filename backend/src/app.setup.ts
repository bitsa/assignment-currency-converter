import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import type { HttpLogger } from 'pino-http';
import { HTTP_LOGGER } from './common/logging/logging.tokens';

export const API_PREFIX = 'api';
export const DOCS_PATH = 'api/docs';
export const DOCS_JSON_PATH = 'api/docs-json';

/**
 * Order matters: the HTTP logger must be mounted before Swagger registers its Express routes,
 * otherwise documentation requests produce no completion line.
 */
export function configureApp(app: NestExpressApplication): void {
  app.useLogger(app.get(Logger));
  app.flushLogs();
  app.use(app.get<HttpLogger>(HTTP_LOGGER));
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
