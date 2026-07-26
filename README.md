# rainy-sdk-ts v0.3

> **Telemetry-first SDK for Rainy API.**
> Error reporting, schema-light events, **client-side sanitization**, activators, counters, hooks, circuit breaker, offline buffer, quality scoring — no OpenAI SDK dependency.

## Breaking change (0.2 → 0.3)

`client.telemetry` is now the **error/event API** (`captureError`, `track`, `addScrubber`).
Local counters remain available via `client.snapshot()`. `TelemetryAggregator` is still exported for advanced use.
`RainySdk` is an alias of `RainyClient`.

## Why not just wrap the OpenAI SDK?

The OpenAI SDK handles completions. It doesn't know about:

- *When* to record a trace (activators)
- *How many* traces fired per scenario (counters)
- *Resilience* when the telemetry endpoint is down (circuit breaker + offline buffer)
- *Quality filtering* before traces leave the process
- *Hooks* for custom observability pipelines

This SDK owns exactly those concerns — nothing more.

## Stack

| Tool | Role |
| ------ | ------ |
| **TypeScript 5.5** `erasableSyntaxOnly` | Native JS emit, no runtime type baggage |
| **tsdown** (Oxc + Rolldown) | Sub-100ms builds |
| **vitest** | Native ESM, fast test runner |
| **zod v4** | Runtime config validation, zero-cost types |
| **mitt** | 130-byte typed event bus |

## Install

```bash
npm install rainy-sdk-ts
# or
bun add rainy-sdk-ts
```

## Quick Start

```typescript
import { RainySdk } from 'rainy-sdk-ts';

const rainy = new RainySdk({
  clientId: 'mate-x',
  apiKey:   'rny_...',
  endpoint: 'https://api.rainy.enosis.dev', // base URL once; routes are internal constants
});

// Error reporting (stack paths / emails scrubbed before leave-process)
try {
  // ...
} catch (err) {
  rainy.telemetry.captureError(err, { context: 'code_review', severity: 'error' });
}

// Schema-light events + property scrubbers
rainy.telemetry.addScrubber('customField', () => '[REDACTED]');
rainy.telemetry.track('feature_used', { feature: 'diff-view', customField: 'secret' });

// Thinking traces (quality-filtered)
await rainy.trace({
  sessionId: rainy.session.id,
  thought:   'I need to verify the user identity before proceeding with the payment.',
  context:   { step: 'auth', model: 'gpt-4o' },
  tags:      ['reasoning', 'critical'],
});

// Local counters / circuit state
console.log(rainy.snapshot());

await rainy.destroy();
```

### Auto-flush

A single interval timer (`flushIntervalMs`, default 4000 ms) flushes the shared
batcher for **traces, errors, and events**. It is the only network activity not
explicitly initiated by the consumer, and it is fully configurable.

## API Reference

### `new RainyClient(opts)`

| Option | Type | Default | Description |
| -------- | ------ | --------- | ------------- |
| `clientId` | `string` | required | App client ID |
| `apiKey` | `string` | required | API key |
| `endpoint` | `string` | required | Base URL |
| `batchSize` | `number` | `25` | Traces per batch |
| `flushIntervalMs` | `number` | `4000` | Auto-flush ms |
| `maxRetries` | `number` | `4` | HTTP retries |
| `offlineBufferSize` | `number` | `500` | Offline queue cap |
| `minQualityScore` | `number` | `0.35` | Min score [0–1] |
| `circuitBreakerThreshold` | `number` | `5` | Failures to open |
| `circuitBreakerResetMs` | `number` | `15000` | Half-open probe ms |

### `.telemetry.captureError(error, context?)` → `void`

Sanitized error report with stack normalization and fingerprint dedupe.

### `.telemetry.track(event, properties?)` → `void`

Schema-light event; properties deep-scrubbed before enqueue.

### `.telemetry.addScrubber(key, fn)` / `.removeScrubber(key)`

Register pure property-level scrubbers (run after built-ins).

### `.trace(input)` → `Promise<void>`

Record a thinking trace. Drops traces below `minQualityScore`.

### `.flush()` → `Promise<FlushResult>`

Force-flush all pending + offline envelopes (all kinds).

### `.snapshot()` → `TelemetrySnapshot`

Instant counters (including `errors.*` / `events.*`), activations, circuit state, uptime.

### `.addActivator(rule)` / `.removeActivator(name)`

Register tag-based rules that fire callbacks on matching traces.

### `.hooks.on(event, handler)`

Lifecycle hooks including `error:captured`, `error:deduped`, `event:tracked`, plus trace/flush/circuit/offline events.

### `.destroy()` → `Promise<FlushResult>`

Flush + teardown. Traces throw after destroy; telemetry soft-fails (safe for process-exit hooks).

## Client-side privacy

See [docs/adr-001-client-side-anonymization.md](./docs/adr-001-client-side-anonymization.md).
Built-in scrubbers redacts home paths, absolute paths, emails, IPs, UUIDs, and JWTs
**before** any payload enters the batcher or network.

## Architecture

```
src/
├── routes.ts             Single source of truth for relative API paths
├── types/
│   ├── branded.ts        TraceId, SessionId, ClientId, ErrorId, EventId, Fingerprint
│   ├── public.ts         Full public type surface + BatchEnvelope
│   ├── internal.ts       Queue + API shapes
│   └── schema.ts         Zod v4 config validation
├── core/
│   ├── client.ts         RainyClient — orchestrator
│   ├── session.ts        Session lifecycle
│   └── trace.ts          TraceRecord builder
├── crypto/
│   └── hasher.ts         SHA-256
├── pipeline/
│   ├── anonymizer.ts     Context redaction (delegates to Sanitizer)
│   ├── scorer.ts         Quality scoring
│   └── batcher.ts        Mixed-kind batch accumulator
├── transport/
│   ├── http.ts           Fetch + multi-kind route dispatch + retry
│   ├── offline.ts        In-memory offline buffer
│   └── circuit-breaker.ts  3-state circuit breaker
├── telemetry/
│   ├── client.ts         Public Telemetry facade
│   ├── routes.ts         TELEMETRY_ROUTES re-export
│   ├── sanitizer.ts      Pluggable scrubbing pipeline
│   ├── fingerprint.ts    Error fingerprint + DedupCache
│   ├── error-capture.ts  captureError pipeline
│   ├── event-tracker.ts  track pipeline
│   ├── types.ts          Severity, ErrorReport, TelemetryEvent
│   ├── counter.ts        Monotonic named counter
│   ├── activator.ts      Tag-based rule engine
│   └── aggregator.ts     Counter registry (internal metrics)
└── hooks/
    └── registry.ts       Typed mitt event bus
```

## License

Apache-2.0 © ferxalbs
