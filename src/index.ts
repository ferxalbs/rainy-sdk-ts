/**
 * rainy-sdk-ts v2 — public surface
 * Telemetry-first SDK: activators, counters, hooks, circuit breaker.
 * Does NOT wrap OpenAI SDK logic — fills its blind spots instead.
 */

// Core
export { RainyClient } from './core/client.js';
export { RainySession } from './core/session.js';

// Activators & Counters
export { Activator } from './telemetry/activator.js';
export { Counter } from './telemetry/counter.js';
export { TelemetryAggregator } from './telemetry/aggregator.js';

// Hooks
export { HookRegistry } from './hooks/registry.js';

// Types
export type {
  RainyClientOptions,
  TraceInput,
  TraceRecord,
  FlushResult,
  TelemetrySnapshot,
  HookEvent,
  HookHandler,
  ActivatorRule,
} from './types/public.js';
export type { TraceId, SessionId, ClientId } from './types/branded.js';
