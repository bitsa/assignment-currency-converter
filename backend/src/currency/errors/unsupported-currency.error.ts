import { AppError } from '../../common/errors/app-error';
import { JsonNumber } from '../json-number';

const MAX_RENDERED_LENGTH = 32;

export class UnsupportedCurrencyError extends AppError {
  constructor(input: unknown) {
    super('VALIDATION_ERROR', 400, `currency ${renderInput(input)} is not supported`);
  }
}

/** Renders any client input for the message; never throws and never echoes a huge value. */
function renderInput(input: unknown): string {
  const rendered = describe(input);
  return rendered.length > MAX_RENDERED_LENGTH
    ? `${rendered.slice(0, MAX_RENDERED_LENGTH - 1)}…`
    : rendered;
}

function describe(input: unknown): string {
  switch (typeof input) {
    case 'string':
      return JSON.stringify(input);
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(input);
    case 'undefined':
      return 'undefined';
    case 'symbol':
      return input.toString();
    case 'function':
      return '[function]';
    default:
      if (input === null) {
        return 'null';
      }
      try {
        // A JSON number keeps its source digits and is quoted like any other input as sent.
        if (input instanceof JsonNumber) {
          return JSON.stringify(input.source);
        }
        return JSON.stringify(input) ?? Object.prototype.toString.call(input);
      } catch {
        try {
          return Object.prototype.toString.call(input);
        } catch {
          return '[unrenderable]';
        }
      }
  }
}
