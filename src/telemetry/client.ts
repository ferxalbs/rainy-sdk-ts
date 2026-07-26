import type { ClientId, SessionId } from '../types/branded.js';
import type { BatchEnvelope, FlushResult } from '../types/public.js';
import type { HookRegistry } from '../hooks/registry.js';
import type { TelemetryAggregator } from './aggregator.js';
import { ErrorCapture } from './error-capture.js';
import { EventTracker } from './event-tracker.js';
import { DedupCache } from './fingerprint.js';
import { Sanitizer } from './sanitizer.js';
import type {
  ErrorContext,
  ResolvedTelemetryOptions,
  Scrubber,
  TelemetryPayload,
} from './types.js';

export interface TelemetryInit {
  clientId: ClientId;
  getSessionId: () => SessionId;
  options: ResolvedTelemetryOptions;
  /** Enqueue a sanitized envelope into the shared batcher (may trigger flush). */
  enqueue: (envelope: BatchEnvelope) => void;
  /** Force-flush shared transport. */
  flush: () => Promise<FlushResult>;
  /** True when the parent RainyClient has been destroyed. */
  isDestroyed: () => boolean;
  metrics: TelemetryAggregator;
  hooks: HookRegistry;
}

/**
 * Public telemetry facade exposed as `client.telemetry`.
 *
 * - `captureError` / `track` are fire-and-forget and never throw to app code.
 * - All payloads pass through {@link Sanitizer} before the batcher.
 * - Soft-fails after parent destroy so process-exit hooks remain safe.
 */
export class Telemetry {
  readonly #sanitizer: Sanitizer;
  readonly #errors: ErrorCapture;
  readonly #events: EventTracker;
  readonly #enqueue: (envelope: BatchEnvelope) => void;
  readonly #flush: () => Promise<FlushResult>;
  readonly #isDestroyed: () => boolean;
  readonly #metrics: TelemetryAggregator;
  readonly #hooks: HookRegistry;

  readonly #cCaptured: { inc(): void };
  readonly #cDeduped: { inc(): void };
  readonly #cErrDropped: { inc(): void };
  readonly #cTracked: { inc(): void };
  readonly #cEvtDropped: { inc(): void };

  constructor(init: TelemetryInit) {
    this.#sanitizer = new Sanitizer({
      builtInScrubbers: init.options.builtInScrubbers,
      maxStringBytes: init.options.maxStringBytes,
    });
    const dedup = new DedupCache(
      init.options.dedupeWindowMs,
      init.options.dedupeMaxEntries,
    );
    this.#errors = new ErrorCapture({
      sanitizer: this.#sanitizer,
      dedup,
      clientId: init.clientId,
      getSessionId: init.getSessionId,
      options: init.options,
    });
    this.#events = new EventTracker({
      sanitizer: this.#sanitizer,
      clientId: init.clientId,
      getSessionId: init.getSessionId,
      options: init.options,
    });
    this.#enqueue = init.enqueue;
    this.#flush = init.flush;
    this.#isDestroyed = init.isDestroyed;
    this.#metrics = init.metrics;
    this.#hooks = init.hooks;

    this.#cCaptured = this.#metrics.counter('errors.captured');
    this.#cDeduped = this.#metrics.counter('errors.deduped');
    this.#cErrDropped = this.#metrics.counter('errors.dropped');
    this.#cTracked = this.#metrics.counter('events.tracked');
    this.#cEvtDropped = this.#metrics.counter('events.dropped');
  }

  /**
   * Capture an error for reporting.
   * Stack paths and PII are scrubbed client-side; identical errors are
   * fingerprint-deduplicated inside the configured window.
   */
  captureError(error: Error | unknown, context?: ErrorContext): void {
    try {
      if (this.#isDestroyed()) return;

      const result = this.#errors.capture(error, context);
      if (!result.ok) {
        if (result.reason === 'deduped') {
          this.#cDeduped.inc();
          this.#hooks.emit('error:deduped', {
            count: result.count ?? 0,
          });
        } else {
          this.#cErrDropped.inc();
        }
        return;
      }

      this.#cCaptured.inc();
      this.#enqueue(result.envelope);
      this.#hooks.emit('error:captured', result.report);
    } catch {
      // Error boundary: never throw into application code
      try {
        this.#cErrDropped.inc();
      } catch {
        /* metrics must not break capture */
      }
    }
  }

  /**
   * Track a named telemetry event with optional properties.
   * Properties are deep-scrubbed before enqueue.
   */
  track<T extends TelemetryPayload>(
    event: string,
    properties?: T,
  ): void {
    try {
      if (this.#isDestroyed()) return;

      const result =
        properties === undefined
          ? this.#events.track(event)
          : this.#events.track(event, properties);

      if (!result.ok) {
        this.#cEvtDropped.inc();
        return;
      }

      this.#cTracked.inc();
      this.#enqueue(result.envelope);
      this.#hooks.emit('event:tracked', result.event);
    } catch {
      try {
        this.#cEvtDropped.inc();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Register a pure key-level scrubber (runs after built-in scrubbers).
   * Throws TypeError on invalid registration (config path — fail fast).
   */
  addScrubber(key: string, scrubber: Scrubber): void {
    this.#sanitizer.addScrubber(key, scrubber);
  }

  removeScrubber(key: string): void {
    this.#sanitizer.removeScrubber(key);
  }

  /** Force-flush the shared client batcher (traces + errors + events). */
  flush(): Promise<FlushResult> {
    if (this.#isDestroyed()) {
      return Promise.resolve({
        submitted: 0,
        skipped: 0,
        failed: 0,
        buffered: 0,
        errors: [],
      });
    }
    return this.#flush();
  }
}
