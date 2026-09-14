/** Root pino logger every log line is written through. */
export const ROOT_LOGGER = Symbol('ROOT_LOGGER');

/** pino-http options shared by the Express middleware and nestjs-pino. */
export const HTTP_LOGGER_OPTIONS = Symbol('HTTP_LOGGER_OPTIONS');

/** pino-http middleware mounted at the Express level. */
export const HTTP_LOGGER = Symbol('HTTP_LOGGER');
