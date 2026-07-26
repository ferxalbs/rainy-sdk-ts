import type { TraceId, SessionId, ClientId } from './branded.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface RainyClientOptions {
  clientId: string;
  apiKey: string;
  endpoint: string;
  /** Max traces per HTTP batch. @default 25 */
  batchSize?: number;
  /** Auto-flush interval ms. @default 4000 */
  flushIntervalMs?: number;
  /** HTTP retry attempts. @default 4 */
  maxRetries?: number;
  /** Offline buffer capacity. @default 500 */
  offlineBufferSize?: number;
  /** Minimum quality score [0–1] to accept a trace. @default 0.35 */
  minQualityScore?: number;
  /** Circuit breaker: consecutive failures before opening. @default 5 */
  circuitBreakerThreshold?: number;
  /** Circuit breaker: ms before half-open probe. @default 15000 */
  circuitBreakerResetMs?: number;
}

// ── Trace ────────────────────────────────────────────────────────────────────

export interface TraceInput {
  sessionId: SessionId;
  /** Raw thinking / reasoning text. Hashed before transmission. */
  thought: string;
  /** Arbitrary context metadata. */
  context?: Record<string, unknown>;
  /** ISO-8601 override. Defaults to Date.now(). */
  timestamp?: string;
  /** Caller-supplied tags for activator matching. */
  tags?: string[];
}

export interface TraceRecord {
  id: TraceId;
  sessionId: SessionId;
  clientId: ClientId;
  thoughtHash: string;
  context: Record<string, unknown>;
  tags: string[];
  qualityScore: number;
  timestamp: string;
  durationMs?: number;
}

export interface FlushResult {
  submitted: number;
  skipped: number;
  failed: number;
  buffered: number;
  errors: Error[];
}

// ── Telemetry ────────────────────────────────────────────────────────────────

export interface TelemetrySnapshot {
  counters: Record<string, number>;
  activations: Record<string, number>;
  flushCount: number;
  totalSubmitted: number;
  totalFailed: number;
  totalSkipped: number;
  offlineBufferSize: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  uptimeMs: number;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export type HookEvent =
  | 'trace:before'
  | 'trace:after'
  | 'trace:skipped'
  | 'flush:before'
  | 'flush:after'
  | 'batch:sent'
  | 'circuit:open'
  | 'circuit:closed'
  | 'offline:enqueue'
  | 'offline:drain';

export type HookHandler<T = unknown> = (payload: T) => void | Promise<void>;

// ── Activators ───────────────────────────────────────────────────────────────

export interface ActivatorRule {
  /** Activator fires when all these tags are present in the trace. */
  tags: string[];
  /** Human-readable name for this activator. */
  name: string;
  /** Optional callback executed when the activator fires. */
  onActivate?: (trace: TraceRecord) => void;
}
