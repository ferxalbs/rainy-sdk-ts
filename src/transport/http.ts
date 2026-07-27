import { ROUTES, joinEndpoint } from '../routes.js';
import type {
  BatchEnvelope,
  BatchKind,
  FlushResult,
} from '../types/public.js';
import type { ApiResponse } from '../types/internal.js';

export interface HttpTransportOptions {
  endpoint: string;
  apiKey: string;
  maxRetries: number;
}

const SDK_VERSION = '0.4.1';

/** All envelope kinds share one authenticated ingestion route. */
export function routeFor(kind: BatchKind): string {
  switch (kind) {
    case 'trace':
    case 'error':
    case 'event':
      return ROUTES.telemetry.batches;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export class HttpTransport {
  readonly #endpoint: string;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #maxRetries: number;

  constructor(opts: HttpTransportOptions) {
    this.#endpoint = opts.endpoint.replace(/\/$/, '');
    this.#maxRetries = opts.maxRetries;
    this.#headers = Object.freeze({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
      'X-Rainy-SDK': `rainy-sdk-ts/${SDK_VERSION}`,
    });
  }

  /**
   * Send a mixed-kind batch in one request. This keeps one auth/rate-limit
   * operation per flush and lets the server correlate events atomically.
   */
  async send(batch: BatchEnvelope[]): Promise<FlushResult> {
    const result: FlushResult = {
      submitted: 0,
      skipped: 0,
      failed: 0,
      buffered: 0,
      errors: [],
    };

    if (batch.length === 0) return result;

    return this.#sendBatch(batch);
  }

  async request<T>(
    route: string,
    init: { method?: 'POST' | 'DELETE'; body?: unknown } = {},
  ): Promise<T> {
    const url = joinEndpoint(this.#endpoint, route);
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
    let attempt = 0;

    while (attempt <= this.#maxRetries) {
      try {
        const response = await fetch(url, {
          method: init.method ?? 'POST',
          headers: this.#headers,
          ...(body === undefined ? {} : { body }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return (await response.json()) as T;
        if (response.status >= 400 && response.status < 500) {
          throw new NonRetryableHttpError(response.status, response.statusText);
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      } catch (error) {
        if (error instanceof NonRetryableHttpError || ++attempt > this.#maxRetries) {
          throw error;
        }
        await sleep(jitteredBackoff(attempt));
      }
    }
    throw new Error('Rainy telemetry request failed');
  }

  async #sendBatch(items: BatchEnvelope[]): Promise<FlushResult> {
    const result: FlushResult = {
      submitted: 0,
      skipped: 0,
      failed: 0,
      buffered: 0,
      errors: [],
    };

    const url = joinEndpoint(this.#endpoint, ROUTES.telemetry.batches);
    const body = JSON.stringify({ items });
    let attempt = 0;

    while (attempt <= this.#maxRetries) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: this.#headers,
          body,
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          const json = (await res.json()) as ApiResponse;
          result.submitted = json.accepted;
          result.failed = json.rejected;
          return result;
        }

        // 4xx → non-retryable
        if (res.status >= 400 && res.status < 500) {
          result.failed = items.length;
          result.errors.push(new Error(`HTTP ${res.status} ${res.statusText}`));
          return result;
        }

        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      } catch (err) {
        if (++attempt > this.#maxRetries) {
          result.failed = items.length;
          result.errors.push(err instanceof Error ? err : new Error(String(err)));
          return result;
        }
        await sleep(jitteredBackoff(attempt));
      }
    }

    return result;
  }
}

class NonRetryableHttpError extends Error {
  constructor(status: number, statusText: string) {
    super(`HTTP ${status} ${statusText}`);
    this.name = 'NonRetryableHttpError';
  }
}

const jitteredBackoff = (n: number): number =>
  Math.min(150 * 2 ** n + Math.random() * 75, 12_000);

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
