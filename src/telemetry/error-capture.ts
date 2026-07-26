import { randomUUID } from 'node:crypto';
import { makeErrorId } from '../types/branded.js';
import type { ClientId, SessionId } from '../types/branded.js';
import type { BatchEnvelope } from '../types/public.js';
import { fingerprintError } from './fingerprint.js';
import type { DedupCache } from './fingerprint.js';
import type { Sanitizer } from './sanitizer.js';
import type {
  ErrorContext,
  ErrorReport,
  ResolvedTelemetryOptions,
  Severity,
} from './types.js';
import { isSeverity } from './types.js';

export interface ErrorCaptureDeps {
  sanitizer: Sanitizer;
  dedup: DedupCache;
  clientId: ClientId;
  getSessionId: () => SessionId;
  options: ResolvedTelemetryOptions;
}

export type CaptureResult =
  | { ok: true; envelope: BatchEnvelope; report: ErrorReport }
  | { ok: false; reason: 'invalid' | 'deduped'; count?: number };

/**
 * Builds a sanitized, fingerprinted ErrorReport envelope.
 * No transport knowledge — pure pipeline step.
 */
export class ErrorCapture {
  readonly #sanitizer: Sanitizer;
  readonly #dedup: DedupCache;
  readonly #clientId: ClientId;
  readonly #getSessionId: () => SessionId;
  readonly #opts: ResolvedTelemetryOptions;

  constructor(deps: ErrorCaptureDeps) {
    this.#sanitizer = deps.sanitizer;
    this.#dedup = deps.dedup;
    this.#clientId = deps.clientId;
    this.#getSessionId = deps.getSessionId;
    this.#opts = deps.options;
  }

  capture(error: unknown, context?: ErrorContext): CaptureResult {
    const duck = coerceError(error);
    if (duck === null) return { ok: false, reason: 'invalid' };

    const severity = resolveSeverity(context?.severity);
    const message = this.#sanitizer.scrubString(duck.message);
    const stack = this.#sanitizer.scrubStack(duck.stack);
    const name = this.#sanitizer.scrubString(duck.name || 'Error');

    const fp = fingerprintError(name, message, stack);
    const decision = this.#dedup.shouldEmit(fp);

    if (!decision.emit) {
      return { ok: false, reason: 'deduped', count: decision.count };
    }

    const extraRaw = context?.extra ?? {};
    const extra = this.#sanitizer.scrubRecord(
      isPlainRecord(extraRaw) ? extraRaw : {},
    );

    const tags = Array.isArray(context?.tags)
      ? context.tags.filter((t): t is string => typeof t === 'string').slice(0, 32)
      : [];

    const ctxLabel =
      typeof context?.context === 'string'
        ? this.#sanitizer.scrubString(context.context).slice(0, 256)
        : undefined;

    const report: ErrorReport = {
      id: makeErrorId(randomUUID()),
      fingerprint: fp,
      name,
      message,
      ...(stack !== undefined ? { stack } : {}),
      severity,
      ...(ctxLabel !== undefined && ctxLabel.length > 0
        ? { context: ctxLabel }
        : {}),
      tags,
      extra,
      occurrenceCount: decision.count,
      clientId: this.#clientId,
      sessionId: this.#getSessionId(),
      timestamp: new Date().toISOString(),
      runtime: readRuntime(),
    };

    // Enforce max string on message/stack already done by sanitizer; clamp name
    if (report.name.length > this.#opts.maxEventNameLength) {
      report.name = report.name.slice(0, this.#opts.maxEventNameLength);
    }

    const envelope: BatchEnvelope = {
      kind: 'error',
      id: report.id,
      payload: report,
      createdAt: Date.now(),
    };

    return { ok: true, envelope, report };
  }
}

// ── Coercion / guards ────────────────────────────────────────────────────────

interface DuckError {
  name: string;
  message: string;
  stack?: string;
}

function coerceError(error: unknown): DuckError | null {
  if (error instanceof Error) {
    const out: DuckError = {
      name: error.name || 'Error',
      message: error.message || '',
    };
    if (typeof error.stack === 'string') out.stack = error.stack;
    return out;
  }

  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const e = error as { name?: unknown; message: string; stack?: unknown };
    const out: DuckError = {
      name: typeof e.name === 'string' ? e.name : 'Error',
      message: e.message,
    };
    if (typeof e.stack === 'string') out.stack = e.stack;
    return out;
  }

  if (typeof error === 'string' && error.length > 0) {
    return { name: 'Error', message: error };
  }

  return null;
}

function resolveSeverity(v: Severity | undefined): Severity {
  if (v !== undefined && isSeverity(v)) return v;
  return 'error';
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function readRuntime(): { node: string; platform: string } {
  const g = globalThis as {
    process?: { version?: string; platform?: string };
  };
  return {
    node: g.process?.version ?? 'unknown',
    platform: g.process?.platform ?? 'unknown',
  };
}
