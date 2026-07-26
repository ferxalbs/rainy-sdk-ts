/**
 * rainy-sdk-ts v0.3 — public surface
 * Telemetry-first SDK: error reporting, events, activators, counters,
 * hooks, circuit breaker. Client-side sanitization before transport.
 * Does NOT wrap OpenAI SDK logic — fills its blind spots instead.
 */

// Core
export { RainyClient } from './core/client.js';
export { RainyClient as RainySdk } from './core/client.js';
export { RainySession } from './core/session.js';

// Telemetry (error reporting + events)
export { Telemetry } from './telemetry/client.js';
export { Sanitizer, redactPath } from './telemetry/sanitizer.js';
export { TELEMETRY_ROUTES } from './telemetry/routes.js';
export { ROUTES, joinEndpoint } from './routes.js';
export { routeFor } from './transport/http.js';

// Local metrics (counters / activators)
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
  BatchKind,
  BatchEnvelope,
  BatchPayload,
  Severity,
  ErrorContext,
  ErrorReport,
  TelemetryPayload,
  TelemetryEvent,
  Scrubber,
  TelemetryOptions,
} from './types/public.js';
export type {
  TraceId,
  SessionId,
  ClientId,
  ErrorId,
  EventId,
  Fingerprint,
} from './types/branded.js';
