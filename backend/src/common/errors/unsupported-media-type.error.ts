import { AppError } from './app-error';

export class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super('UNSUPPORTED_MEDIA_TYPE', 415, 'content-type must be application/json');
  }
}
