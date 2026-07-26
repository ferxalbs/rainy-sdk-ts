# rainy-sdk-ts v2

> **Telemetry-first SDK for Rainy API.**
> Fills the blind spots the OpenAI SDK ignores: activators, counters, hooks, circuit breaker, offline buffer, quality scoring — all with zero runtime overhead and no OpenAI SDK dependency.

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
|------|------|
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
import { RainyClient } from 'rainy-sdk-ts';

const client = new RainyClient({
  clientId: 'my-app',
  apiKey:   'rny_...',
  endpoint: 'https://api.rainy.enosis.dev',
});

// Register an activator — fires when trace has these tags
client.addActivator({
  name: 'high-stakes-reasoning',
  tags: ['reasoning', 'critical'],
  onActivate: (trace) => console.log('Activated on', trace.id),
});

// Hook into the lifecycle
client.hooks.on('circuit:open',  () => console.warn('Circuit breaker OPEN'));
client.hooks.on('batch:sent',    (r) => console.log('Batch sent', r));
client.hooks.on('offline:enqueue', () => console.log('Buffering offline'));

// Record a trace
await client.trace({
  sessionId: client.session.id,
  thought:   'I need to verify the user identity before proceeding with the payment.',
  context:   { step: 'auth', model: 'gpt-4o' },
  tags:      ['reasoning', 'critical'],
});

// Get a live telemetry snapshot
console.log(client.snapshot());
// {
//   counters: { 'traces.total': 1, 'flush.count': 0, ... },
//   activations: { 'high-stakes-reasoning': 1 },
//   circuitBreakerState: 'closed',
//   offlineBufferSize: 0,
//   uptimeMs: 42,
//   ...
// }

await client.destroy();
```

## API Reference

### `new RainyClient(opts)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
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

### `.trace(input)` → `Promise<void>`
Record a thinking trace. Drops traces below `minQualityScore`.

### `.flush()` → `Promise<FlushResult>`
Force-flush all pending + offline traces.

### `.snapshot()` → `TelemetrySnapshot`
Instant counters, activations, circuit state, uptime.

### `.addActivator(rule)` / `.removeActivator(name)`
Register tag-based rules that fire callbacks on matching traces.

### `.hooks.on(event, handler)`
Lifecycle hooks: `trace:before`, `trace:after`, `trace:skipped`, `flush:before`, `flush:after`, `batch:sent`, `circuit:open`, `circuit:closed`, `offline:enqueue`, `offline:drain`.

### `.destroy()` → `Promise<FlushResult>`
Flush + teardown. Client unusable after this.

## Architecture

```
src/
├── types/
│   ├── branded.ts        TraceId, SessionId, ClientId
│   ├── public.ts         Full public type surface
│   ├── internal.ts       Queue + API shapes
│   └── schema.ts         Zod v4 config validation
├── core/
│   ├── client.ts         RainyClient — orchestrator
│   ├── session.ts        Session lifecycle
│   └── trace.ts          TraceRecord builder
├── crypto/
│   └── hasher.ts         SHA-256 anonymisation
├── pipeline/
│   ├── anonymizer.ts     Context PII redaction
│   ├── scorer.ts         Quality scoring
│   └── batcher.ts        Batch accumulator
├── transport/
│   ├── http.ts           Fetch + jittered retry
│   ├── offline.ts        In-memory offline buffer
│   └── circuit-breaker.ts  3-state circuit breaker
├── telemetry/
│   ├── counter.ts        Monotonic named counter
│   ├── activator.ts      Tag-based rule engine
│   └── aggregator.ts     Counter registry
└── hooks/
    └── registry.ts       Typed mitt event bus
```

## License

Apache-2.0 © ferxalbs
