import type { TraceRecord, FlushResult } from '../types/public.js';
import type { ApiResponse } from '../types/internal.js';

export interface HttpTransportOptions {
  endpoint: string;
  apiKey:   string;
  maxRetries: number;
}

const SDK_VERSION = '0.2.0';

export class HttpTransport {
  readonly #endpoint: string;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #maxRetries: number;

  constructor(opts: HttpTransportOptions) {
    this.#endpoint   = opts.endpoint.replace(/\/$/, '');
    this.#maxRetries = opts.maxRetries;
    this.#headers    = Object.freeze({
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${opts.apiKey}`,
      'X-Rainy-SDK':   `rainy-sdk-ts/${SDK_VERSION}`,
    });
  }

  async send(batch: TraceRecord[]): Promise<FlushResult> {
    const result: FlushResult = { submitted: 0, skipped: 0, failed: 0, buffered: 0, errors: [] };
    let attempt = 0;

    while (attempt <= this.#maxRetries) {
      try {
        const res = await fetch(`${this.#endpoint}/v1/traces`, {
          method:  'POST',
          headers: this.#headers,
          body:    JSON.stringify({ traces: batch }),
          signal:  AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          const body = await res.json() as ApiResponse;
          result.submitted = body.accepted;
          result.failed    = body.rejected;
          return result;
        }

        // 4xx → non-retryable
        if (res.status >= 400 && res.status < 500) {
          result.failed = batch.length;
          result.errors.push(new Error(`HTTP ${res.status} ${res.statusText}`));
          return result;
        }

        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      } catch (err) {
        if (++attempt > this.#maxRetries) {
          result.failed = batch.length;
          result.errors.push(err instanceof Error ? err : new Error(String(err)));
          return result;
        }
        await sleep(jitteredBackoff(attempt));
      }
    }

    return result;
  }
}

const jitteredBackoff = (n: number): number =>
  Math.min(150 * 2 ** n + Math.random() * 75, 12_000);

const sleep = (ms: number): Promise<void> =>
  new Promise(r => setTimeout(r, ms));
