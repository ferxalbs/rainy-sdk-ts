import { ROUTES, joinEndpoint } from '../routes.js';
import { TELEMETRY_ROUTES } from '../telemetry/routes.js';
import type {
  BatchEnvelope,
  BatchKind,
  ErrorReport,
  FlushResult,
  TelemetryEvent,
  TraceRecord,
} from '../types/public.js';
import type { ApiResponse } from '../types/internal.js';

export interface HttpTransportOptions {
  endpoint: string;
  apiKey: string;
  maxRetries: number;
}

const SDK_VERSION = '0.3.0';

/** Map envelope kind → route constant from the SSoT table. */
export function routeFor(kind: BatchKind): string {
  switch (kind) {
    case 'trace':
      return ROUTES.traces;
    case 'error':
      return TELEMETRY_ROUTES.errors;
    case 'event':
      return TELEMETRY_ROUTES.events;
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
   * Send a mixed-kind batch. Envelopes are partitioned by kind and each
   * non-empty partition is POSTed to its route constant.
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

    const partitions = partitionByKind(batch);

    for (const kind of KIND_ORDER) {
      const items = partitions.get(kind);
      if (items === undefined || items.length === 0) continue;

      const part = await this.#sendKind(kind, items);
      result.submitted += part.submitted;
      result.failed += part.failed;
      result.errors.push(...part.errors);
    }

    return result;
  }

  async #sendKind(kind: BatchKind, items: BatchEnvelope[]): Promise<FlushResult> {
    const result: FlushResult = {
      submitted: 0,
      skipped: 0,
      failed: 0,
      buffered: 0,
      errors: [],
    };

    const url = joinEndpoint(this.#endpoint, routeFor(kind));
    const body = serializeKind(kind, items);
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

const KIND_ORDER: readonly BatchKind[] = ['trace', 'error', 'event'];

function partitionByKind(
  batch: BatchEnvelope[],
): Map<BatchKind, BatchEnvelope[]> {
  const map = new Map<BatchKind, BatchEnvelope[]>();
  for (const env of batch) {
    const list = map.get(env.kind);
    if (list) list.push(env);
    else map.set(env.kind, [env]);
  }
  return map;
}

function serializeKind(kind: BatchKind, items: BatchEnvelope[]): string {
  switch (kind) {
    case 'trace':
      return JSON.stringify({
        traces: items.map((e) => e.payload as TraceRecord),
      });
    case 'error':
      return JSON.stringify({
        items: items.map((e) => e.payload as ErrorReport),
      });
    case 'event':
      return JSON.stringify({
        items: items.map((e) => e.payload as TelemetryEvent),
      });
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

const jitteredBackoff = (n: number): number =>
  Math.min(150 * 2 ** n + Math.random() * 75, 12_000);

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
