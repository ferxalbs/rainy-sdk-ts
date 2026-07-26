/**
 * Branded primitive types — prevent accidental ID mix-ups at compile time.
 *
 * Usage:
 *   const id = '...' as TraceId;
 *   function accept(id: TraceId) {}   // won't accept a plain string
 */

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

/** Unique identifier for a single thinking trace. */
export type TraceId = Brand<string, 'TraceId'>;

/** Unique identifier for a user/agent session. */
export type SessionId = Brand<string, 'SessionId'>;

/** Your Rainy application client identifier. */
export type ClientId = Brand<string, 'ClientId'>;

// ── helpers ────────────────────────────────────────────────────────────────

export function makeTraceId(raw: string): TraceId {
  return raw as TraceId;
}

export function makeSessionId(raw: string): SessionId {
  return raw as SessionId;
}

export function makeClientId(raw: string): ClientId {
  return raw as ClientId;
}
