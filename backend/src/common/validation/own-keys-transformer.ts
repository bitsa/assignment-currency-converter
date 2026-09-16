import type { Type } from '@nestjs/common';
import type { TransformerPackage } from '@nestjs/common/interfaces/external/transformer-package.interface';

/**
 * Stands in for class-transformer in the validation pipe. It copies the body's own keys onto a
 * bare DTO instance and leaves every value as parsed, so a `JsonNumber` amount keeps its
 * source digits (class-transformer would turn it into a plain object).
 */
export const OWN_KEYS_TRANSFORMER: TransformerPackage = Object.freeze({
  plainToInstance<T>(cls: Type<T>, plain: unknown): T {
    const instance = Object.create(cls.prototype as object) as T;
    if (typeof plain === 'object' && plain !== null) {
      for (const key of Object.keys(plain)) {
        Object.defineProperty(instance, key, {
          value: (plain as Record<string, unknown>)[key],
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return instance;
  },
  classToPlain(object: unknown): Record<string, unknown> {
    return object as Record<string, unknown>;
  },
});
