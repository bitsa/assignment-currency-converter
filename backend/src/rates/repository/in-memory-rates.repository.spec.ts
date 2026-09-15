import { describeRatesRepositoryContract } from '../../testing/rates-repository-contract';
import { InMemoryRatesRepository } from './in-memory-rates.repository';

describeRatesRepositoryContract(
  'InMemoryRatesRepository',
  (options) => new InMemoryRatesRepository(options),
);
