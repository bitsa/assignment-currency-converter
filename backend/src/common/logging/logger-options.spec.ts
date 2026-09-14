import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Writable } from 'node:stream';
import pino from 'pino';
import { LOG_LEVELS } from '../../config/env.schema';
import {
  buildHttpLoggerOptions,
  buildRootLoggerOptions,
  completionLogLevel,
} from './logger-options';

function memorySink(): { readonly stream: Writable; readonly lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
      callback();
    },
  });
  return { stream, lines };
}

describe('buildRootLoggerOptions', () => {
  it('uses pino-pretty human-readable output in development', () => {
    const options = buildRootLoggerOptions({ nodeEnv: 'development', logLevel: 'info' });

    expect(options.transport).toEqual({
      target: 'pino-pretty',
      options: { singleLine: true },
    });
  });

  it('writes the level field as a lower-case label outside development', () => {
    const sink = memorySink();
    const logger = pino(
      buildRootLoggerOptions({ nodeEnv: 'production', logLevel: 'info' }),
      sink.stream,
    );

    logger.warn('something recovered');

    expect(sink.lines).toHaveLength(1);
    expect((JSON.parse(sink.lines[0] ?? '') as { level: unknown }).level).toBe('warn');
  });

  it('writes plain JSON with no pretty transport when NODE_ENV is test', () => {
    const options = buildRootLoggerOptions({ nodeEnv: 'test', logLevel: 'info' });
    const sink = memorySink();

    pino(options, sink.stream).info({ event: 'sample' }, 'hello');

    expect(options.transport).toBeUndefined();
    expect(sink.lines).toHaveLength(1);
    expect(sink.lines[0]).not.toContain('');
    expect(() => JSON.parse(sink.lines[0] ?? '') as unknown).not.toThrow();
  });

  it('passes LOG_LEVEL through as the logger level', () => {
    expect(
      LOG_LEVELS.map((logLevel) => buildRootLoggerOptions({ nodeEnv: 'test', logLevel }).level),
    ).toEqual([...LOG_LEVELS]);
  });
});

describe('completionLogLevel', () => {
  it.each([
    [200, 'info'],
    [399, 'info'],
    [400, 'warn'],
    [404, 'warn'],
    [499, 'warn'],
    [500, 'error'],
    [503, 'error'],
    [599, 'error'],
  ] as const)('logs a %i response at %s', (statusCode, level) => {
    expect(completionLogLevel('/api/nope', statusCode)).toBe(level);
  });

  it('logs a request that failed with an error at error', () => {
    expect(completionLogLevel('/api/nope', 200, new Error('boom'))).toBe('error');
  });

  it('silences the completion line of a /health request that answered 200, with or without a query string', () => {
    expect(
      ['/health', '/health?probe=1', '/health/'].map((url) => completionLogLevel(url, 200)),
    ).toEqual(['silent', 'silent', 'silent']);
  });

  it('still logs a /health request that answered 503', () => {
    expect(completionLogLevel('/health', 503)).toBe('error');
  });
});

describe('buildHttpLoggerOptions', () => {
  it('generates a different non-empty string request id for each request', () => {
    const options = buildHttpLoggerOptions(pino({ level: 'silent' }));
    const ids = [1, 2].map(() => {
      const req = new IncomingMessage(new Socket());
      return options.genReqId?.(req, new ServerResponse(req));
    });

    expect(typeof ids[0]).toBe('string');
    expect(ids[0]).not.toBe('');
    expect(ids[0]).not.toEqual(ids[1]);
  });
});
