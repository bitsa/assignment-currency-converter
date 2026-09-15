import type { RatesCacheOptions } from '../rates/repository/rates-cache-options.interface';
import type { RatesRepository } from '../rates/repository/rates-repository.interface';
import { describeSnapshot, sampleSnapshot } from './rate-snapshots';

const NOW = new Date('2026-09-11T08:00:05.000Z');
const TTL_SECONDS = 5;

/** The behaviour every `RatesRepository` implementation must share. */
export function describeRatesRepositoryContract(
  label: string,
  create: (options: RatesCacheOptions) => RatesRepository,
): void {
  describe(`${label} contract`, () => {
    let repository: RatesRepository;

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW });
      repository = create({ ttlSeconds: TTL_SECONDS });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves null from get when nothing is stored', async () => {
      await expect(repository.get()).resolves.toBeNull();
    });

    it('reads absent when nothing is stored', async () => {
      await expect(repository.read()).resolves.toEqual({ status: 'absent' });
    });

    it('resolves the same rates in the same order with the same codes, asOf, fetchedAt and exact decimal values after set', async () => {
      const snapshot = sampleSnapshot(NOW);
      await repository.set(snapshot);

      const stored = await repository.get();

      expect(stored).not.toBeNull();
      expect(describeSnapshot(stored!)).toEqual(describeSnapshot(snapshot));
    });

    it('reads hit with the stored snapshot after set', async () => {
      const snapshot = sampleSnapshot(NOW);
      await repository.set(snapshot);

      const read = await repository.read();

      expect(read.status).toBe('hit');
      expect(read.status === 'hit' && describeSnapshot(read.snapshot)).toEqual(
        describeSnapshot(snapshot),
      );
    });

    it('resolves the second snapshot after two consecutive sets', async () => {
      const second = sampleSnapshot(new Date(NOW.getTime() + 1000));
      await repository.set(sampleSnapshot(NOW));
      await repository.set(second);

      const stored = await repository.get();

      expect(stored?.fetchedAt.toISOString()).toBe(second.fetchedAt.toISOString());
    });

    it('resolves null from get once more than the TTL has passed since set', async () => {
      await repository.set(sampleSnapshot(NOW));

      await jest.advanceTimersByTimeAsync(TTL_SECONDS * 1000 + 1);

      await expect(repository.get()).resolves.toBeNull();
    });

    it('still resolves the snapshot from get when exactly the TTL has passed since set', async () => {
      await repository.set(sampleSnapshot(NOW));

      await jest.advanceTimersByTimeAsync(TTL_SECONDS * 1000);

      await expect(repository.get()).resolves.not.toBeNull();
    });

    it('resolves null from get after clear', async () => {
      await repository.set(sampleSnapshot(NOW));

      await repository.clear();

      await expect(repository.get()).resolves.toBeNull();
    });

    it('resolves clear without error when nothing is stored', async () => {
      await expect(repository.clear()).resolves.toBeUndefined();
    });
  });
}
