import { AppError } from './app-error';
import { UnsupportedMediaTypeError } from './unsupported-media-type.error';

describe('UnsupportedMediaTypeError', () => {
  it('carries code UNSUPPORTED_MEDIA_TYPE, status 415 and the fixed message', () => {
    const error = new UnsupportedMediaTypeError();

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(error.httpStatus).toBe(415);
    expect(error.message).toBe('content-type must be application/json');
  });
});
