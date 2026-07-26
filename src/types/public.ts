import type { TraceId, SessionId, ClientId } from './branded.js';

// ── Client configuration ───────────────────────────────────────────────────

export interface RainyClientOptions {
  /** Your Rainy application client ID. */
  clientId: string;
  /** Your Rainy API key. */
  apiKey: string;
  /** Base URL of the Rainy API endpoint. */
  endpoint: string;
  /** Number of traces to accumulate before auto-flushing. Default: 20 */
  batchSize?: number;
  /** Interval in ms between automatic flush attempts. Default: 5000 */
  flushIntervalMs?: number;
  /** Maximum retry attempts on transient HTTP errors. Default: 3 */
  maxRetries?: number;
  /** Maximum traces to hold in the offline buffer. Default: 200 */
  offlineBufferSize?: number;
  /** Minimum quality score [0–1] required to submit a trace. Default: 0.4 */
  minQualityScore?: number;
}

// ── Trace input ────────────────────────────────────────────────────────────

export interface TraceInput {
  /** Session this trace belongs to. */
  sessionId: SessionId;
  /** The thinking/reasoning text to record. */
  thought: string;
  /** Optional arbitrary context metadata. */
  context?: Record<string, unknown>;
  /** Optional ISO-8601 timestamp; defaults to now. */
  timestamp?: string;
}

// ── Trace record (after processing) ───────────────────────────────────────

export interface TraceRecord {
  id: TraceId;
  sessionId: SessionId;
  clientId: ClientId;
  thoughtHash: string;
  context: Record<string, unknown>;
  qualityScore: number;
  timestamp: string;
}

// ── Flush result ───────────────────────────────────────────────────────────

export interface FlushResult {
  submitted: number;
  skipped: number;
  failed: number;
  errors: Error[];
}
