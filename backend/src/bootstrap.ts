import { Logger, type INestApplication, type LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';

export async function createApp(): Promise<NestExpressApplication> {
  // bufferLogs + autoFlushLogs:false keep Nest's console logger silent until pino takes over;
  // abortOnError:false turns a failed boot into a rejected promise instead of process.abort().
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...APP_OPTIONS,
    bufferLogs: true,
    autoFlushLogs: false,
    abortOnError: false,
  });
  configureApp(app);
  return app;
}

export async function startServer(
  app: INestApplication,
  port: number,
  logger: Pick<LoggerService, 'log'>,
): Promise<void> {
  await app.listen(port);
  logger.log({ event: 'app.listening', port }, `Listening on port ${port}`);
}

export async function bootstrap(): Promise<void> {
  const app = await createApp();
  await startServer(app, app.get(AppConfigService).port, new Logger('Bootstrap'));
}

/** Runs before (or instead of) the logger, so it writes one plain line to stderr. */
export function reportBootstrapFailure(
  error: unknown,
  stderr: Pick<NodeJS.WritableStream, 'write'> = process.stderr,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  const message = error instanceof Error ? error.message : String(error);
  stderr.write(`Bootstrap failed: ${message}\n`, () => exit(1));
}
