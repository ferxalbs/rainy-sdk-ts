import { makeClientId } from '../types/branded.js';
import { RainySession } from './session.js';
import { buildTrace } from './trace.js';
import { Batcher } from '../pipeline/batcher.js';
import { HttpTransport } from '../transport/http.js';
import { OfflineBuffer } from '../transport/offline.js';
import type { RainyClientOptions, TraceInput, FlushResult } from '../types/public.js';

const DEFAULTS = {
  batchSize: 20,
  flushIntervalMs: 5_000,
  maxRetries: 3,
  offlineBufferSize: 200,
  minQualityScore: 0.4,
} as const;

/**
 * Main entry point for the Rainy SDK.
 *
 * ```ts
 * const client = new RainyClient({ clientId, apiKey, endpoint });
 * await client.trace({ sessionId: client.session.id, thought: '...' });
 * await client.flush();
 * ```
 */
export class RainyClient {
  readonly #clientId: ReturnType<typeof makeClientId>;
  readonly #opts: Required<RainyClientOptions>;
  readonly #transport: HttpTransport;
  readonly #batcher: Batcher;
  readonly #offline: OfflineBuffer;
  readonly #session: RainySession;
  #flushTimer: ReturnType<typeof setInterval> | null = null;
  #destroyed = false;

  constructor(opts: RainyClientOptions) {
    this.#opts = { ...DEFAULTS, ...opts };
    this.#clientId = makeClientId(opts.clientId);
    this.#session = new RainySession();
    this.#transport = new HttpTransport({
      endpoint: this.#opts.endpoint,
      apiKey: this.#opts.apiKey,
      maxRetries: this.#opts.maxRetries,
    });
    this.#batcher = new Batcher(this.#opts.batchSize);
    this.#offline = new OfflineBuffer(this.#opts.offlineBufferSize);
    this.#startTimer();
  }

  get session(): RainySession {
    return this.#session;
  }

  /**
   * Record a thinking trace.
   * Traces below `minQualityScore` are silently dropped.
   */
  async trace(input: TraceInput): Promise<void> {
    this.#assertAlive();
    const record = buildTrace(input, this.#clientId);

    if (record.qualityScore < this.#opts.minQualityScore) return;

    const batch = this.#batcher.add(record);
    if (batch && batch.length > 0) {
      await this.#sendBatch(batch);
    }
  }

  /** Force-flush all pending traces immediately. */
  async flush(): Promise<FlushResult> {
    this.#assertAlive();
    const pending = this.#batcher.flush();
    const offline = this.#offline.drain();
    const all = [...offline, ...pending];

    if (all.length === 0) {
      return { submitted: 0, skipped: 0, failed: 0, errors: [] };
    }

    return this.#sendBatch(all);
  }

  /**
   * Flush remaining traces and stop the auto-flush timer.
   * The client must not be used after calling destroy.
   */
  async destroy(): Promise<FlushResult> {
    const result = await this.flush();
    this.#stopTimer();
    this.#session.end();
    this.#destroyed = true;
    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  async #sendBatch(batch: typeof this.#batcher extends Batcher ? ReturnType<Batcher['flush']> : never): Promise<FlushResult> {
    const result = await this.#transport.send(batch);
    if (result.failed > 0) {
      for (const record of batch) {
        this.#offline.enqueue(record);
      }
    }
    return result;
  }

  #startTimer(): void {
    this.#flushTimer = setInterval(() => {
      void this.flush();
    }, this.#opts.flushIntervalMs);
    if (typeof this.#flushTimer === 'object' && this.#flushTimer !== null) {
      (this.#flushTimer as NodeJS.Timeout).unref?.();
    }
  }

  #stopTimer(): void {
    if (this.#flushTimer !== null) {
      clearInterval(this.#flushTimer);
      this.#flushTimer = null;
    }
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error('RainyClient has been destroyed — create a new instance.');
    }
  }
}
