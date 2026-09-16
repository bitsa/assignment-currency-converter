import type { IncomingMessage, ServerResponse } from 'node:http';
import { JsonNumber } from '../../currency/json-number';
import { RequestValidationError } from '../errors/request-validation.error';
import {
  JSON_BODY_LIMIT_BYTES,
  jsonBodyParserOptions,
  translateBodyParserError,
} from './json-body-parser';

const REQ = {} as IncomingMessage;
const RES = {} as ServerResponse;

/** The shape body-parser gives its errors (http-errors with a `type`). */
function parserError(type: string, status: number): Error {
  return Object.assign(new Error(`parser said ${type}`), { type, status, expose: status < 500 });
}

function translated(error: unknown): unknown {
  const next = jest.fn<void, [unknown?]>();
  translateBodyParserError(error, REQ, RES, next);
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0]?.[0];
}

function bodyMessage(error: unknown): string | undefined {
  return error instanceof RequestValidationError ? error.message : undefined;
}

describe('JSON body parser', () => {
  it('parses at most 16 KiB of application/json, non-strict, keeping JSON numbers as source text', () => {
    const options = jsonBodyParserOptions();
    const reviver = options.reviver;

    expect(options.limit).toBe(JSON_BODY_LIMIT_BYTES);
    expect(JSON_BODY_LIMIT_BYTES).toBe(16384);
    expect(options.strict).toBe(false);
    expect(JSON.parse('{"amount":1e2}', reviver)).toEqual({ amount: new JsonNumber('1e2') });
    expect(
      options.type({ headers: { 'content-type': 'application/json' } } as IncomingMessage),
    ).toBe(true);
    expect(options.type({ headers: { 'content-type': 'text/plain' } } as IncomingMessage)).toBe(
      false,
    );
    expect(options.type({ headers: {} } as IncomingMessage)).toBe(false);
  });

  it('maps parser errors to too large and not valid JSON', () => {
    expect(bodyMessage(translated(parserError('entity.too.large', 413)))).toBe(
      'request body is too large',
    );
    expect(bodyMessage(translated(parserError('entity.parse.failed', 400)))).toBe(
      'request body is not valid JSON',
    );
    expect(bodyMessage(translated(parserError('request.aborted', 400)))).toBe(
      'request body is not valid JSON',
    );
    expect(bodyMessage(translated(parserError('request.size.invalid', 400)))).toBe(
      'request body is not valid JSON',
    );
  });

  it('reports an unsupported charset on a JSON media type as not valid JSON', () => {
    const error = translated(parserError('charset.unsupported', 415));

    expect(error).toBeInstanceOf(RequestValidationError);
    expect((error as RequestValidationError).details).toEqual([
      { field: 'body', message: 'request body is not valid JSON' },
    ]);
    expect(bodyMessage(translated(parserError('encoding.unsupported', 415)))).toBe(
      'request body is not valid JSON',
    );
  });

  it('rejects a zero-length body in verify so it is reported as not valid JSON', () => {
    const { verify } = jsonBodyParserOptions();
    let thrown: unknown;
    try {
      verify(REQ, RES, Buffer.alloc(0));
    } catch (error) {
      thrown = error;
    }

    expect(() => verify(REQ, RES, Buffer.from('{}'))).not.toThrow();
    expect(thrown).toEqual(expect.objectContaining({ type: 'entity.empty' }));
    // body-parser rethrows a verify error as a 403 keeping its `type`.
    Object.assign(thrown as object, { status: 403 });
    expect(bodyMessage(translated(thrown))).toBe('request body is not valid JSON');
  });

  it('passes errors that did not come from the body parser on unchanged', () => {
    const plain = new Error('boom');
    const serverSide = parserError('stream.not.readable', 500);

    expect(translated(plain)).toBe(plain);
    expect(translated(serverSide)).toBe(serverSide);
    expect(translated('text')).toBe('text');
    expect(translated(null)).toBeNull();
  });
});
