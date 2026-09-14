import { randomUUID } from 'node:crypto';
import type { LevelWithSilent, Logger, LoggerOptions } from 'pino';
import type { Options } from 'pino-http';
import type { LogLevel, NodeEnv } from '../../config/env.schema';

export const HEALTH_PATH = '/health';

export interface LoggerSettings {
  readonly nodeEnv: NodeEnv;
  readonly logLevel: LogLevel;
}

export function buildRootLoggerOptions(settings: LoggerSettings): LoggerOptions {
  const base: LoggerOptions = { level: settings.logLevel };
  if (settings.nodeEnv === 'development') {
    return { ...base, transport: { target: 'pino-pretty', options: { singleLine: true } } };
  }
  return { ...base, formatters: { level: (label: string) => ({ level: label }) } };
}

export function buildHttpLoggerOptions(logger: Logger): Options {
  return {
    logger,
    genReqId: () => randomUUID(),
    quietReqLogger: true,
    customLogLevel: (req, res, error) => completionLogLevel(req.url, res.statusCode, error),
  };
}

export function completionLogLevel(
  url: string | undefined,
  statusCode: number,
  error?: Error,
): LevelWithSilent {
  if (pathOf(url) === HEALTH_PATH && statusCode === 200) {
    return 'silent';
  }
  if (error !== undefined || statusCode >= 500) {
    return 'error';
  }
  if (statusCode >= 400) {
    return 'warn';
  }
  return 'info';
}

function pathOf(url: string | undefined): string {
  const path = (url ?? '').split('?', 1)[0] ?? '';
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}
