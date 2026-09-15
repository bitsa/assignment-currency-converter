import { AppError } from '../../../common/errors/app-error';
import { CacheUnavailableError } from './cache-unavailable.error';

describe('CacheUnavailableError', () => {
  it('carries code CACHE_UNAVAILABLE and HTTP status 503', () => {
    const error = new CacheUnavailableError('read', 'failed');

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('CACHE_UNAVAILABLE');
    expect(error.httpStatus).toBe(503);
  });

  it('builds messages from the operation and the failure kind only', () => {
    const errors = [
      new CacheUnavailableError('read', 'failed'),
      new CacheUnavailableError('write', 'timed out'),
      new CacheUnavailableError('delete', 'failed'),
    ];

    expect(errors.map((error) => [error.name, error.operation, error.message])).toEqual([
      ['CacheUnavailableError', 'read', 'Redis read failed'],
      ['CacheUnavailableError', 'write', 'Redis write timed out'],
      ['CacheUnavailableError', 'delete', 'Redis delete failed'],
    ]);
  });
});
