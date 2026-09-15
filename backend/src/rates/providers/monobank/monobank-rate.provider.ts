import type { HttpService } from '@nestjs/axios';
import type { LoggerService } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { firstValueFrom } from 'rxjs';
import type { RateSnapshot } from '../../rate.types';
import { UpstreamHttpError } from '../errors/upstream-http.error';
import { UpstreamInvalidResponseError } from '../errors/upstream-invalid-response.error';
import { UpstreamNetworkError } from '../errors/upstream-network.error';
import { UpstreamRateLimitedError } from '../errors/upstream-rate-limited.error';
import { UpstreamTimeoutError } from '../errors/upstream-timeout.error';
import { UpstreamError } from '../errors/upstream.error';
import type { RateProvider } from '../rate-provider.interface';
import type { MonobankProviderOptions } from './monobank-provider-options.interface';
import { mapMonobankItems } from './monobank-rate.mapper';
import { parseMonobankBody } from './monobank-response.parser';

export const MONOBANK_CURRENCY_PATH = '/bank/currency';
export const MONOBANK_MAX_BODY_BYTES = 1_048_576;

export type ProviderLogger = Pick<LoggerService, 'warn'>;

const SYSTEM_ERROR_CODE = /^E[A-Z_]+$/;

interface RawResponse {
  readonly body: string;
  readonly fetchedAt: Date;
}

/**
 * Adapter over Monobank's `/bank/currency` feed. One attempt per call: no retry, no cache and no
 * coalescing of concurrent calls. Every failure is one of the `Upstream*` errors.
 */
export class MonobankRateProvider implements RateProvider {
  private readonly url: string;

  constructor(
    private readonly http: HttpService,
    private readonly options: MonobankProviderOptions,
    private readonly logger: ProviderLogger,
  ) {
    this.url = options.baseUrl.replace(/\/+$/, '') + MONOBANK_CURRENCY_PATH;
  }

  async getRates(): Promise<RateSnapshot> {
    const { body, fetchedAt } = await this.fetchBody();

    // Parse and map outside the transport catch: a local defect must never read as a network
    // failure, or a retry policy would retry it.
    const { rates, skipped } = mapMonobankItems(parseMonobankBody(body));
    if (skipped.count > 0) {
      this.logger.warn(
        {
          event: 'rates.provider_items_skipped',
          skipped: skipped.count,
          unknownCodes: skipped.unknownCodes,
          sameCurrencyPairs: skipped.sameCurrencyPairs,
          duplicatePairs: skipped.duplicatePairs,
        },
        `Skipped ${skipped.count} Monobank items`,
      );
    }
    if (rates.length === 0) {
      throw new UpstreamInvalidResponseError('no usable items');
    }
    return Object.freeze({ rates: Object.freeze([...rates]), fetchedAt });
  }

  /** Request, status and body under one timer that covers the time to a complete response. */
  private async fetchBody(): Promise<RawResponse> {
    const controller = new AbortController();
    let stream: Readable | undefined;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      stream?.destroy();
    }, this.options.timeoutMs);

    try {
      const response = await firstValueFrom(
        this.http.get<Readable>(this.url, {
          headers: { accept: 'application/json' },
          responseType: 'stream',
          validateStatus: () => true,
          maxRedirects: 0,
          signal: controller.signal,
        }),
      );
      stream = response.data;
      if (timedOut) {
        stream.destroy();
        throw new UpstreamTimeoutError(this.options.timeoutMs);
      }
      if (response.status < 200 || response.status > 299) {
        stream.destroy();
        throw response.status === 429
          ? new UpstreamRateLimitedError()
          : new UpstreamHttpError(response.status);
      }
      const body = await readLimited(stream);
      return { body, fetchedAt: new Date() };
    } catch (error) {
      if (timedOut) {
        throw new UpstreamTimeoutError(this.options.timeoutMs);
      }
      if (error instanceof UpstreamError) {
        throw error;
      }
      throw new UpstreamNetworkError(systemErrorCode(error) ?? 'transport error');
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readLimited(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    bytes += buffer.length;
    if (bytes > MONOBANK_MAX_BODY_BYTES) {
      stream.destroy();
      throw new UpstreamInvalidResponseError(`body exceeds ${MONOBANK_MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Only a system error code such as `ECONNREFUSED`; never the message, which may hold the URL. */
function systemErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const candidates = [
    (error as { code?: unknown }).code,
    (error as { cause?: { code?: unknown } }).cause?.code,
  ];
  return candidates.find(
    (code): code is string => typeof code === 'string' && SYSTEM_ERROR_CODE.test(code),
  );
}
