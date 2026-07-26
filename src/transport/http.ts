import type { TraceRecord, FlushResult } from '../types/public.js';
import type { ApiResponse } from '../types/internal.js';

export interface HttpTransportOptions {
  endpoint: string;
  apiKey: string;
  maxRetries: number;
}

/**
 * HTTP transport layer with exponential-backoff retry.
 * Zero runtime deps — uses the built-in `fetch` available in Node >= 18.
 */
export class HttpTransport {
  readonly #endpoint: string;
  readonly #headers: Record<string, string>;
  readonly #maxRetries: number;

  constructor(opts: HttpTransportOptions) {
    this.#endpoint = opts.endpoint.replace(/\/$/, '');
    this.#maxRetries = opts.maxRetries;
    this.#headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opts.apiKey}`,
      'X-Rainy-SDK': 'rainy-sdk-ts/0.1.0',
    };
  }

  async send(batch: TraceRecord[]): Promise<FlushResult> {
    const result: FlushResult = { submitted: 0, skipped: 0, failed: 0, errors: [] };
    let attempt = 0;

    while (attempt <= this.#maxRetries) {
      try {
        const res = await fetch(`${this.#endpoint}/v1/traces`, {
          method: 'POST',
          headers: this.#headers,
          body: JSON.stringify({ traces: batch }),
        });

        if (res.ok) {
          const body = await res.json() as ApiResponse;
          result.submitted = body.accepted;
          result.failed = body.rejected;
          return result;
        }

        // 4xx — not retryable
        if (res.status >= 400 && res.status < 500) {
          result.failed = batch.length;
          result.errors.push(new Error(`HTTP ${res.status}: ${res.statusText}`));
          return result;
        }

        // 5xx — retryable
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      } catch (err) {
        attempt++;
        if (attempt > this.#maxRetries) {
          result.failed = batch.length;
          result.errors.push(err instanceof Error ? err : new Error(String(err)));
          return result;
        }
        await sleep(backoff(attempt));
      }
    }

    return result;
  }
}

function backoff(attempt: number): number {
  return Math.min(100 * 2 ** attempt + Math.random() * 50, 10_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
