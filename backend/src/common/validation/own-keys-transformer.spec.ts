import { JsonNumber } from '../../currency/json-number';
import { OWN_KEYS_TRANSFORMER } from './own-keys-transformer';

class SampleDto {
  readonly amount!: unknown;
}

describe('OWN_KEYS_TRANSFORMER', () => {
  it('keeps JsonNumber values and own keys when building the DTO instance', () => {
    const amount = new JsonNumber('0.100000000000000005');
    const plain = { amount, extra: 'kept', nested: { a: 1 } };

    const instance = OWN_KEYS_TRANSFORMER.plainToInstance(SampleDto, plain) as SampleDto &
      Record<string, unknown>;

    expect(instance).toBeInstanceOf(SampleDto);
    expect(instance.constructor).toBe(SampleDto);
    expect(instance.amount).toBe(amount);
    expect(instance['nested']).toBe(plain.nested);
    expect(Object.keys(instance)).toEqual(['amount', 'extra', 'nested']);
    expect(OWN_KEYS_TRANSFORMER.classToPlain(instance)).toBe(instance);
  });

  it('builds an empty DTO instance from a value that is not an object', () => {
    const instance = OWN_KEYS_TRANSFORMER.plainToInstance(SampleDto, 'EUR');

    expect(instance).toBeInstanceOf(SampleDto);
    expect(Object.keys(instance)).toEqual([]);
  });
});
