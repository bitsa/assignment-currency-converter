import type { IncomingMessage, ServerResponse } from 'node:http';
import { JsonNumber } from '../../currency/json-number';
import { RequestValidationError } from '../errors/request-validation.error';
import { isJsonMediaType } from './json-media-type';

export const JSON_BODY_LIMIT_BYTES = 16 * 1024;

export interface JsonBodyParserOptions {
  readonly limit: number;
  readonly strict: false;
  readonly reviver: typeof JsonNumber.reviver;
  readonly type: (req: IncomingMessage) => boolean;
  readonly verify: (req: IncomingMessage, res: ServerResponse, buf: Buffer) => void;
}

/** Requests whose JSON body was read and had zero bytes; body-parser turns those into `{}`. */
const emptyBodies = new WeakSet<object>();

/** True when the parser read this request's body and it was empty. */
export function hadEmptyJsonBody(req: object): boolean {
  return emptyBodies.has(req);
}

/**
 * Non-strict, so a body such as `"EUR"` or `42` parses and is then refused as "not an object"
 * rather than as "not JSON". Numbers keep their source text (`JsonNumber`).
 */
export function jsonBodyParserOptions(): JsonBodyParserOptions {
  return {
    limit: JSON_BODY_LIMIT_BYTES,
    strict: false,
    reviver: JsonNumber.reviver,
    type: (req) => isJsonMediaType(req.headers['content-type']),
    // Only recorded here: the parser runs on every route, and an empty body is an error only
    // where a body is required (see JsonObjectBodyGuard).
    verify: (req, _res, buf) => {
      if (buf.length === 0) {
        emptyBodies.add(req);
      }
    },
  };
}

/** body-parser error types that mean the body could not be read as JSON. */
const NOT_JSON_TYPES: ReadonlySet<string> = new Set([
  'entity.parse.failed',
  'charset.unsupported',
  'encoding.unsupported',
]);

/**
 * Express error middleware (four parameters) mounted right after the JSON parser. Parser
 * failures become validation errors with fixed wording, so neither the parser's message nor
 * the body reaches the client; any other error is passed on unchanged.
 */
export function translateBodyParserError(
  error: unknown,
  _req: IncomingMessage,
  _res: ServerResponse,
  next: (error?: unknown) => void,
): void {
  next(translate(error));
}

function translate(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) {
    return error;
  }
  const { type, status } = error as { readonly type?: unknown; readonly status?: unknown };
  if (typeof type !== 'string') {
    return error;
  }
  if (type === 'entity.too.large') {
    return RequestValidationError.bodyTooLarge();
  }
  if (NOT_JSON_TYPES.has(type) || isClientErrorStatus(status)) {
    return RequestValidationError.bodyNotJson();
  }
  return error;
}

function isClientErrorStatus(status: unknown): boolean {
  return typeof status === 'number' && status >= 400 && status < 500;
}
