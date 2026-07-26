/**
 * rainy-sdk-ts — public entry point
 * Re-exports only the public API surface.
 */

export { RainyClient } from './core/client.js';
export { RainySession } from './core/session.js';
export type {
  RainyClientOptions,
  TraceInput,
  TraceRecord,
  FlushResult,
} from './types/public.js';
export type { TraceId, SessionId, ClientId } from './types/branded.js';
