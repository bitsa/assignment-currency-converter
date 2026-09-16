const JSON_MEDIA_TYPE = 'application/json';

/** `application/json` in any case, parameters allowed; `+json` types do not match. */
export function isJsonMediaType(contentType: string | undefined): boolean {
  if (contentType === undefined) {
    return false;
  }
  const [mediaType = ''] = contentType.split(';', 1);
  return mediaType.trim().toLowerCase() === JSON_MEDIA_TYPE;
}
