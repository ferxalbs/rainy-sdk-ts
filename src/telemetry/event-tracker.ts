import { randomUUID } from 'node:crypto';
import { makeEventId } from '../types/branded.js';
import type { ClientId, SessionId } from '../types/branded.js';
import type { BatchEnvelope } from '../types/public.js';
import type { Sanitizer } from './sanitizer.js';
import type {
  ResolvedTelemetryOptions,
  TelemetryEvent,
  TelemetryPayload,
} from './types.js';

export interface EventTrackerDeps {
  sanitizer: Sanitizer;
  clientId: ClientId;
  getSessionId: () => SessionId;
  options: ResolvedTelemetryOptions;
}

export type TrackResult =
  | { ok: true; envelope: BatchEnvelope; event: TelemetryEvent }
  | { ok: false; reason: 'invalid_name' | 'invalid_properties' };

const EVENT_NAME_RE = /^[\w.:-]+$/;

/**
 * Builds a sanitized TelemetryEvent envelope.
 * Schema-less properties, type-guarded via generic T.
 */
export class EventTracker {
  readonly #sanitizer: Sanitizer;
  readonly #clientId: ClientId;
  readonly #getSessionId: () => SessionId;
  readonly #opts: ResolvedTelemetryOptions;

  constructor(deps: EventTrackerDeps) {
    this.#sanitizer = deps.sanitizer;
    this.#clientId = deps.clientId;
    this.#getSessionId = deps.getSessionId;
    this.#opts = deps.options;
  }

  track<T extends TelemetryPayload>(
    event: string,
    properties?: T,
  ): TrackResult {
    const name = normalizeEventName(event, this.#opts.maxEventNameLength);
    if (name === null) return { ok: false, reason: 'invalid_name' };

    let props: TelemetryPayload = {};
    if (properties !== undefined) {
      if (!isPlainRecord(properties)) {
        return { ok: false, reason: 'invalid_properties' };
      }
      props = this.#sanitizer.scrubRecord(properties) as TelemetryPayload;
    }

    const record: TelemetryEvent = {
      id: makeEventId(randomUUID()),
      name,
      properties: props,
      clientId: this.#clientId,
      sessionId: this.#getSessionId(),
      timestamp: new Date().toISOString(),
    };

    const envelope: BatchEnvelope = {
      kind: 'event',
      id: record.id,
      payload: record,
      createdAt: Date.now(),
    };

    return { ok: true, envelope, event: record };
  }
}

function normalizeEventName(raw: string, maxLen: number): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Strip control chars
  const cleaned = trimmed.replace(/[\u0000-\u001F\u007F]/g, '');
  if (cleaned.length === 0) return null;
  const clipped = cleaned.slice(0, maxLen);
  // Soft validation: allow unicode letters via \w in unicode mode? Keep ASCII-ish.
  if (!EVENT_NAME_RE.test(clipped)) {
    // Still accept if we can coerce to safe form
    const safe = clipped.replace(/[^\w.:-]+/g, '_').replace(/^_+|_+$/g, '');
    if (safe.length === 0) return null;
    return safe.slice(0, maxLen);
  }
  return clipped;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}
