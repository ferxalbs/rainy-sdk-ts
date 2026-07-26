import { makeClientId } from '../types/branded.js';
import { ClientOptionsSchema } from '../types/schema.js';
import { RainySession } from './session.js';
import { buildTrace } from './trace.js';
import { Batcher } from '../pipeline/batcher.js';
import { HttpTransport } from '../transport/http.js';
import { OfflineBuffer } from '../transport/offline.js';
import { CircuitBreaker } from '../transport/circuit-breaker.js';
import { TelemetryAggregator } from '../telemetry/aggregator.js';
import { Activator } from '../telemetry/activator.js';
import { Counter } from '../telemetry/counter.js';
import { HookRegistry } from '../hooks/registry.js';
import type { RainyClientOptions, TraceInput, FlushResult, TelemetrySnapshot, ActivatorRule } from '../types/public.js';
import type { ValidatedOptions } from '../types/schema.js';

export class RainyClient {
  readonly #opts: ValidatedOptions;
  readonly #clientId: ReturnType<typeof makeClientId>;
  readonly #session: RainySession;
  readonly #transport: HttpTransport;
  readonly #batcher: Batcher;
  readonly #offline: OfflineBuffer;
  readonly #circuit: CircuitBreaker;
  readonly #telemetry: TelemetryAggregator;
  readonly #activator: Activator;
  readonly #hooks: HookRegistry;

  // Built-in counters
  readonly #cTotal:   Counter;
  readonly #cSkipped: Counter;
  readonly #cFailed:  Counter;
  readonly #cFlush:   Counter;

  #flushTimer: ReturnType<typeof setInterval> | null = null;
  #destroyed = false;
  readonly #startedAt = Date.now();

  constructor(opts: RainyClientOptions) {
    this.#opts      = ClientOptionsSchema.parse(opts);
    this.#clientId  = makeClientId(opts.clientId);
    this.#session   = new RainySession();
    this.#hooks     = new HookRegistry();
    this.#circuit   = new CircuitBreaker(
      this.#opts.circuitBreakerThreshold,
      this.#opts.circuitBreakerResetMs,
      (state) => {
        if (state === 'open')   this.#hooks.emit('circuit:open', undefined);
        if (state === 'closed') this.#hooks.emit('circuit:closed', undefined);
      },
    );
    this.#transport = new HttpTransport({
      endpoint:   this.#opts.endpoint,
      apiKey:     this.#opts.apiKey,
      maxRetries: this.#opts.maxRetries,
    });
    this.#batcher   = new Batcher(this.#opts.batchSize);
    this.#offline   = new OfflineBuffer(this.#opts.offlineBufferSize);
    this.#telemetry = new TelemetryAggregator();
    this.#activator = new Activator();

    this.#cTotal   = this.#telemetry.counter('traces.total');
    this.#cSkipped = this.#telemetry.counter('traces.skipped');
    this.#cFailed  = this.#telemetry.counter('traces.failed');
    this.#cFlush   = this.#telemetry.counter('flush.count');

    this.#startTimer();
  }

  // ── Public getters ───────────────────────────────────────────────────────

  get session(): RainySession   { return this.#session; }
  get hooks(): HookRegistry     { return this.#hooks; }
  get telemetry(): TelemetryAggregator { return this.#telemetry; }

  // ── Activator management ─────────────────────────────────────────────────

  addActivator(rule: ActivatorRule): void {
    this.#activator.add(rule);
  }

  removeActivator(name: string): void {
    this.#activator.remove(name);
  }

  // ── Tracing ──────────────────────────────────────────────────────────────

  async trace(input: TraceInput): Promise<void> {
    this.#assertAlive();
    const t0 = Date.now();

    this.#hooks.emit('trace:before', input);
    const record = buildTrace(input, this.#clientId, t0);
    this.#cTotal.inc();

    if (record.qualityScore < this.#opts.minQualityScore) {
      this.#cSkipped.inc();
      this.#hooks.emit('trace:skipped', record);
      return;
    }

    // Fire matching activators
    this.#activator.evaluate(record);

    this.#hooks.emit('trace:after', record);

    const batch = this.#batcher.add(record);
    if (batch && batch.length > 0) await this.#sendBatch(batch);
  }

  // ── Flush ────────────────────────────────────────────────────────────────

  async flush(): Promise<FlushResult> {
    this.#assertAlive();
    this.#hooks.emit('flush:before', undefined);
    this.#cFlush.inc();

    const pending = this.#batcher.flush();
    const offline = this.#circuit.isOpen ? [] : this.#offline.drain();
    const all     = [...offline, ...pending];

    if (all.length === 0) {
      const empty: FlushResult = { submitted: 0, skipped: 0, failed: 0, buffered: this.#offline.size, errors: [] };
      this.#hooks.emit('flush:after', empty);
      return empty;
    }

    const result = await this.#sendBatch(all);
    this.#hooks.emit('flush:after', result);
    return result;
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────

  snapshot(): TelemetrySnapshot {
    return {
      counters:            this.#telemetry.allCounters(),
      activations:         this.#activator.activationCounts(),
      flushCount:          this.#cFlush.value,
      totalSubmitted:      this.#telemetry.counter('transport.submitted').value,
      totalFailed:         this.#cFailed.value,
      totalSkipped:        this.#cSkipped.value,
      offlineBufferSize:   this.#offline.size,
      circuitBreakerState: this.#circuit.state,
      uptimeMs:            Date.now() - this.#startedAt,
    };
  }

  // ── Destroy ──────────────────────────────────────────────────────────────

  async destroy(): Promise<FlushResult> {
    const result = await this.flush();
    this.#stopTimer();
    this.#session.end();
    this.#destroyed = true;
    return result;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  async #sendBatch(batch: import('../types/public.js').TraceRecord[]): Promise<FlushResult> {
    if (this.#circuit.isOpen) {
      for (const r of batch) this.#offline.enqueue(r);
      return { submitted: 0, skipped: 0, failed: 0, buffered: this.#offline.size, errors: [] };
    }

    const result = await this.#transport.send(batch);
    this.#circuit.record(result.failed === 0);

    if (result.failed > 0) {
      this.#cFailed.add(result.failed);
      for (const r of batch) this.#offline.enqueue(r);
      this.#hooks.emit('offline:enqueue', batch);
    }

    this.#telemetry.counter('transport.submitted').add(result.submitted);
    this.#hooks.emit('batch:sent', result);
    return { ...result, buffered: this.#offline.size };
  }

  #startTimer(): void {
    this.#flushTimer = setInterval(() => { void this.flush(); }, this.#opts.flushIntervalMs);
    (this.#flushTimer as NodeJS.Timeout).unref?.();
  }

  #stopTimer(): void {
    if (this.#flushTimer !== null) {
      clearInterval(this.#flushTimer);
      this.#flushTimer = null;
    }
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('RainyClient is destroyed — instantiate a new one.');
  }
}
