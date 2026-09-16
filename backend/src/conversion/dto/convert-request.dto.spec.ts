import type { ArgumentMetadata } from '@nestjs/common';
import type { FieldError } from '../../common/errors/field-error.types';
import { RequestValidationError } from '../../common/errors/request-validation.error';
import { createValidationPipe } from '../../common/validation/validation-pipe.factory';
import { JsonNumber } from '../../currency/json-number';
import { ConvertRequestDto } from './convert-request.dto';

const METADATA: ArgumentMetadata = { type: 'body', metatype: ConvertRequestDto };

function num(source: string): JsonNumber {
  return new JsonNumber(source);
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { from: 'EUR', to: 'GBP', amount: num('100'), ...overrides };
}

async function validate(input: Record<string, unknown>): Promise<unknown> {
  return createValidationPipe().transform(input, METADATA);
}

async function detailsFor(input: Record<string, unknown>): Promise<readonly FieldError[]> {
  const error: unknown = await validate(input).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof RequestValidationError)) {
    throw new Error(`expected a RequestValidationError, got ${String(error)}`);
  }
  return error.details;
}

async function expectAccepted(input: Record<string, unknown>): Promise<void> {
  await expect(validate(input)).resolves.toBeInstanceOf(ConvertRequestDto);
}

describe('ConvertRequestDto validation', () => {
  it('passes a valid body through with its values untouched', async () => {
    const amount = num('100');

    const dto = (await validate({ from: 'EUR', to: 'GBP', amount })) as ConvertRequestDto;

    expect(dto.from).toBe('EUR');
    expect(dto.amount).toBe(amount);
  });

  it('accepts lower-case and space-padded codes', async () => {
    await expectAccepted(body({ from: ' eur ', to: 'gbp' }));
  });

  it('reports "<field> is required" for each missing from, to and amount', async () => {
    await expect(detailsFor({})).resolves.toEqual([
      { field: 'from', message: 'from is required' },
      { field: 'to', message: 'to is required' },
      { field: 'amount', message: 'amount is required' },
    ]);
    for (const field of ['from', 'to', 'amount']) {
      const input = body();
      delete input[field];

      await expect(detailsFor(input)).resolves.toEqual([
        { field, message: `${field} is required` },
      ]);
    }
  });

  it('reports a null field as required', async () => {
    await expect(detailsFor(body({ amount: null }))).resolves.toEqual([
      { field: 'amount', message: 'amount is required' },
    ]);
    await expect(detailsFor(body({ from: null }))).resolves.toEqual([
      { field: 'from', message: 'from is required' },
    ]);
  });

  it('rejects unsupported codes XAU, ABC, empty string and the number 840 with the value as sent', async () => {
    const cases: readonly [unknown, string][] = [
      ['XAU', 'currency "XAU" is not supported'],
      ['ABC', 'currency "ABC" is not supported'],
      ['', 'currency "" is not supported'],
      [num('840'), 'currency "840" is not supported'],
    ];
    for (const [code, message] of cases) {
      await expect(detailsFor(body({ from: code }))).resolves.toEqual([{ field: 'from', message }]);
      await expect(detailsFor(body({ to: code }))).resolves.toEqual([{ field: 'to', message }]);
    }
  });

  it('cuts an unsupported code longer than 32 characters in the message', async () => {
    const [detail] = await detailsFor(body({ to: 'Q'.repeat(100) }));

    expect(detail?.field).toBe('to');
    expect(detail?.message).toBe(`currency "${'Q'.repeat(30)}… is not supported`);
  });

  it('rejects the fund code BOV and the metal XAU as unsupported, not as a conversion error', async () => {
    await expect(detailsFor(body({ from: 'BOV', to: 'XAU' }))).resolves.toEqual([
      { field: 'from', message: 'currency "BOV" is not supported' },
      { field: 'to', message: 'currency "XAU" is not supported' },
    ]);
  });

  it('rejects abc, "1,000", "+5", "1e3", true and {} as not a number or numeric string', async () => {
    for (const amount of ['abc', '1,000', '+5', '1e3', true, {}]) {
      await expect(detailsFor(body({ amount }))).resolves.toEqual([
        { field: 'amount', message: 'amount must be a number or a numeric string' },
      ]);
    }
  });

  it('rejects 0, -1, "-1", "0.00" and -0 as not a positive number', async () => {
    for (const amount of [num('0'), num('-1'), '-1', '0.00', num('-0')]) {
      await expect(detailsFor(body({ amount }))).resolves.toEqual([
        { field: 'amount', message: 'amount must be a positive number' },
      ]);
    }
  });

  it('rejects 10.123 USD and 1.5 JPY with the decimal-places message naming the currency', async () => {
    await expect(detailsFor(body({ from: 'USD', amount: num('10.123') }))).resolves.toEqual([
      { field: 'amount', message: 'amount must have at most 2 decimal places for USD' },
    ]);
    await expect(detailsFor(body({ from: 'jpy', amount: num('1.5') }))).resolves.toEqual([
      { field: 'amount', message: 'amount must have at most 0 decimal places for JPY' },
    ]);
  });

  it('rejects the JSON number 0.100000000000000005 for USD by its source digits', async () => {
    await expect(
      detailsFor(body({ from: 'USD', amount: num('0.100000000000000005') })),
    ).resolves.toEqual([
      { field: 'amount', message: 'amount must have at most 2 decimal places for USD' },
    ]);
  });

  it('rejects unknown fields rateType and foo with field "<name>" is not allowed', async () => {
    await expect(detailsFor(body({ rateType: 'bank', foo: 1 }))).resolves.toEqual([
      { field: 'rateType', message: 'field "rateType" is not allowed' },
      { field: 'foo', message: 'field "foo" is not allowed' },
    ]);
  });

  it('rejects unknown fields named like built-in object methods, such as hasOwnProperty and toString', async () => {
    await expect(
      detailsFor(body({ hasOwnProperty: 1, foo: 2, toString: 'x', valueOf: null })),
    ).resolves.toEqual([
      { field: 'hasOwnProperty', message: 'field "hasOwnProperty" is not allowed' },
      { field: 'foo', message: 'field "foo" is not allowed' },
      { field: 'toString', message: 'field "toString" is not allowed' },
      { field: 'valueOf', message: 'field "valueOf" is not allowed' },
    ]);
  });

  it('lists one detail per invalid field when several fields are invalid', async () => {
    await expect(
      detailsFor({ foo: 'x', amount: '-5', to: 'XAU', bar: null, from: 'usd' }),
    ).resolves.toEqual([
      { field: 'to', message: 'currency "XAU" is not supported' },
      { field: 'amount', message: 'amount must be a positive number' },
      { field: 'foo', message: 'field "foo" is not allowed' },
      { field: 'bar', message: 'field "bar" is not allowed' },
    ]);
  });

  it('reports only from when from is unsupported and the amount has many decimals', async () => {
    await expect(detailsFor(body({ from: 'XAU', amount: num('1.12345') }))).resolves.toEqual([
      { field: 'from', message: 'currency "XAU" is not supported' },
    ]);
  });

  it('accepts "100.500" for USD because trailing zeros do not count', async () => {
    await expectAccepted(body({ from: 'USD', amount: '100.500' }));
  });

  it('rejects "007.50" as not a number or numeric string', async () => {
    await expect(detailsFor(body({ amount: '007.50' }))).resolves.toEqual([
      { field: 'amount', message: 'amount must be a number or a numeric string' },
    ]);
  });

  it('accepts a space-padded numeric string amount', async () => {
    await expectAccepted(body({ amount: ' 100.50 ' }));
  });
});
