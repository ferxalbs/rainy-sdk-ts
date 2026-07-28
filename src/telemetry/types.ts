import type { ClientId, ErrorId, EventId, Fingerprint, SessionId } from '../types/branded.js';

// ── Severity ─────────────────────────────────────────────────────────────────

export type Severity = 'fatal' | 'error' | 'warning' | 'info';

export const SEVERITIES: readonly Severity[] = [
  'fatal',
  'error',
  'warning',
  'info',
] as const;

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);
}

// ── Error reporting ──────────────────────────────────────────────────────────

export interface ErrorContext {
  /** Short scene label, e.g. `"code_review"`. */
  context?: string;
  /** @default "error" */
  severity?: Severity;
  tags?: string[];
  /** Arbitrary metadata — scrubbed before transport. */
  extra?: Record<string, unknown>;
}

export interface ErrorReport {
  id: ErrorId;
  fingerprint: Fingerprint;
  name: string;
  /** Sanitized message. */
  message: string;
  /** Sanitized / path-normalized stack. */
  stack?: string;
  severity: Severity;
  context?: string;
  tags: string[];
  extra: Record<string, unknown>;
  occurrenceCount: number;
  clientId: ClientId;
  sessionId: SessionId;
  timestamp: string;
  runtime: {
    node: string;
    platform: string;
  };
}

// ── Generic events ───────────────────────────────────────────────────────────

/** Schema-less payload constrained to a plain object. */
export type TelemetryPayload = Record<string, unknown>;

export interface TelemetryEvent<T extends TelemetryPayload = TelemetryPayload> {
  id: EventId;
  name: string;
  properties: T;
  clientId: ClientId;
  sessionId: SessionId;
  timestamp: string;
}

// ── Scrubbing ────────────────────────────────────────────────────────────────

/**
 * Pure property-level scrubber. Must be side-effect-free and deterministic.
 * Receives the (already built-in-scrubbed) value and the object key.
 */
export type Scrubber = (value: unknown, key: string) => unknown;

// ── Options ──────────────────────────────────────────────────────────────────

export interface TelemetryOptions {
  /** Dedupe window for identical error fingerprints (ms). @default 60_000 */
  dedupeWindowMs?: number;
  /** Max fingerprints retained in the dedupe cache. @default 512 */
  dedupeMaxEntries?: number;
  /** Max string length retained after scrub (chars). @default 8_192 */
  maxStringBytes?: number;
  /** Max event name length. @default 128 */
  maxEventNameLength?: number;
  /** Enable built-in path/email/IP/UUID scrubbers. @default true */
  builtInScrubbers?: boolean;
  /**
   * Report this SDK instance as one product session. Start/end delivery is
   * best-effort and never changes application control flow. @default true
   */
  sessionTracking?: boolean;
}

export interface ResolvedTelemetryOptions {
  dedupeWindowMs: number;
  dedupeMaxEntries: number;
  maxStringBytes: number;
  maxEventNameLength: number;
  builtInScrubbers: boolean;
  sessionTracking: boolean;
}

export const DEFAULT_TELEMETRY_OPTIONS: ResolvedTelemetryOptions = {
  dedupeWindowMs: 60_000,
  dedupeMaxEntries: 512,
  maxStringBytes: 8_192,
  maxEventNameLength: 128,
  builtInScrubbers: true,
  sessionTracking: true,
};

export function resolveTelemetryOptions(
  partial?: TelemetryOptions | null | Record<string, unknown>,
): ResolvedTelemetryOptions {
  if (partial === undefined || partial === null) {
    return { ...DEFAULT_TELEMETRY_OPTIONS };
  }
  const p = partial as TelemetryOptions;
  return {
    dedupeWindowMs:
      p.dedupeWindowMs ?? DEFAULT_TELEMETRY_OPTIONS.dedupeWindowMs,
    dedupeMaxEntries:
      p.dedupeMaxEntries ?? DEFAULT_TELEMETRY_OPTIONS.dedupeMaxEntries,
    maxStringBytes:
      p.maxStringBytes ?? DEFAULT_TELEMETRY_OPTIONS.maxStringBytes,
    maxEventNameLength:
      p.maxEventNameLength ?? DEFAULT_TELEMETRY_OPTIONS.maxEventNameLength,
    builtInScrubbers:
      p.builtInScrubbers ?? DEFAULT_TELEMETRY_OPTIONS.builtInScrubbers,
    sessionTracking:
      p.sessionTracking ?? DEFAULT_TELEMETRY_OPTIONS.sessionTracking,
  };
}
