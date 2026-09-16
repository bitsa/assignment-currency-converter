import { isJsonMediaType } from './json-media-type';

describe('isJsonMediaType', () => {
  it('matches application/json case-insensitively with parameters and rejects +json types', () => {
    for (const accepted of [
      'application/json',
      'Application/JSON; charset=utf-8',
      ' application/json ;foo=bar',
      'APPLICATION/JSON;charset=utf-16',
    ]) {
      expect(isJsonMediaType(accepted)).toBe(true);
    }
    for (const rejected of [
      undefined,
      '',
      'application/problem+json',
      'application/vnd.api+json',
      'text/json',
      'text/plain',
      'application/x-www-form-urlencoded',
      'application/jsonx',
    ]) {
      expect(isJsonMediaType(rejected)).toBe(false);
    }
  });
});
