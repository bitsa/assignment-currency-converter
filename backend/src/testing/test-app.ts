import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import { AppModule } from '../app.module';
import { APP_OPTIONS, configureApp } from '../app.setup';
import { RATE_PROVIDER } from '../rates/rates.tokens';
import type { RateProvider } from '../rates/providers/rate-provider.interface';
import { buildRootLoggerOptions } from '../common/logging/logger-options';
import { ROOT_LOGGER } from '../common/logging/logging.tokens';
import type { LogLevel } from '../config/env.schema';
import { REDIS_CLIENT } from '../redis/redis.tokens';

export interface LogLine {
  readonly level: string;
  readonly msg?: string;
  readonly reqId?: string;
  readonly req?: { readonly method: string; readonly url: string };
  readonly res?: { readonly statusCode: number };
  readonly [key: string]: unknown;
}

export interface FakeRedis {
  readonly ping: jest.Mock<Promise<string>, []>;
  readonly get: jest.Mock<Promise<string | null>, [string]>;
  readonly set: jest.Mock<Promise<unknown>, [string, string, 'EX', number]>;
  readonly del: jest.Mock<Promise<number>, [string]>;
  readonly disconnect: jest.Mock<void, []>;
}

export interface TestAppOptions {
  readonly logLevel?: LogLevel;
  /** Replaces the Monobank provider when given. */
  readonly rateProvider?: RateProvider;
}

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly redis: FakeRedis;
  rawLogLines(): readonly string[];
  logLines(): readonly LogLine[];
  clearLogs(): void;
}

/** The real AppModule with a fake Redis client and every log line captured in memory. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      lines.push(
        ...chunk
          .toString('utf8')
          .split('\n')
          .filter((line) => line.length > 0),
      );
      callback();
    },
  });
  const redis: FakeRedis = {
    ping: jest.fn<Promise<string>, []>().mockResolvedValue('PONG'),
    get: jest.fn<Promise<string | null>, [string]>().mockResolvedValue(null),
    set: jest.fn<Promise<unknown>, [string, string, 'EX', number]>().mockResolvedValue('OK'),
    del: jest.fn<Promise<number>, [string]>().mockResolvedValue(0),
    disconnect: jest.fn<void, []>(),
  };
  const rootLogger = pino(
    buildRootLoggerOptions({ nodeEnv: 'test', logLevel: options.logLevel ?? 'info' }),
    sink,
  );

  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(REDIS_CLIENT)
    .useValue(redis)
    .overrideProvider(ROOT_LOGGER)
    .useValue(rootLogger);
  if (options.rateProvider !== undefined) {
    builder.overrideProvider(RATE_PROVIDER).useValue(options.rateProvider);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    ...APP_OPTIONS,
    bufferLogs: true,
    autoFlushLogs: false,
  });
  configureApp(app);
  await app.init();

  return {
    app,
    redis,
    rawLogLines: () => [...lines],
    logLines: () => lines.map((line) => JSON.parse(line) as LogLine),
    clearLogs: () => {
      lines.length = 0;
    },
  };
}
