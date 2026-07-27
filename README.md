# Rainy SDK for TypeScript

Telemetry and internal-logic instrumentation for AI products.

`rainy-sdk-ts` does **not** replace the OpenAI, Anthropic, or provider SDK your
application already uses. It wraps your existing operations to add privacy-safe
observability, error intelligence, counters, quality signals, activators,
offline resilience, and product-specific hooks without changing their results.

## The difference

Provider SDKs answer: “How do I call the model?”

Rainy answers:

- Which product workflow invoked it?
- How long did the complete internal operation take?
- How many input, output, cached, and reasoning tokens were used?
- Which tools ran and how did the operation finish?
- What did Rainy charge?
- Which failures repeat across machines?
- Which signals should activate a product workflow?
- How can the application observe this without sending prompts, code, paths,
  credentials, or generated text?

## Install

```bash
npm install rainy-sdk-ts
# or
bun add rainy-sdk-ts
```

Requires Node.js 22 or newer.

## Observe existing SDK calls

```typescript
import OpenAI from 'openai';
import {
  RainyClient,
  extractAiResponseTelemetry,
} from 'rainy-sdk-ts';

const openai = new OpenAI({
  apiKey: process.env.RAINY_API_KEY,
  baseURL: process.env.RAINY_API_URL,
});

const rainy = new RainyClient({
  clientId: 'mate-x',
  apiKey: process.env.RAINY_API_KEY!,
  endpoint: process.env.RAINY_TELEMETRY_URL!,
});

const result = await rainy.telemetry.observe(
  'code-review.generate',
  () =>
    openai.chat.completions
      .create({
        model: 'openai/gpt-5',
        messages,
        tools,
      })
      .withResponse(),
  {
    kind: 'llm',
    attributes: {
      feature: 'code-review',
      mode: 'guided',
    },
    extractResult: extractAiResponseTelemetry,
  },
);

// The wrapped result is unchanged.
const completion = result.data;
```

`extractAiResponseTelemetry` reads only operational metadata:

- response/model identifiers;
- input, output, total, cached, and reasoning tokens;
- tool-call count and finish reasons;
- Rainy request id, billing plan, credits, and daily remaining headers.

It deliberately never reads messages, prompts, generated text, tool arguments,
repository content, or code.

## Instrument internal logic

`observe` works with any synchronous or asynchronous operation, not only model
calls:

```typescript
const findings = await rainy.telemetry.observe(
  'repository.attack-surface',
  () => scanRepository(workspace),
  {
    kind: 'workflow',
    attributes: {
      scanner: 'attack-surface',
      repositoryKind: 'typescript',
    },
    extractResult: (result) => ({
      findingCount: result.findings.length,
      criticalCount: result.findings.filter(
        (finding) => finding.severity === 'critical',
      ).length,
    }),
  },
);
```

Rainy returns the original value. If the operation fails, it rethrows the exact
same error after recording:

- duration and operation classification;
- safe status/code metadata;
- a sanitized error report;
- a stable path-independent fingerprint for deduplication.

Telemetry extraction failures are isolated and never break application logic.

## Local mode for embedded products

MaTE X can adopt Rainy instrumentation before a remote collector is enabled:

```typescript
const rainy = new RainyClient({
  clientId: 'mate-x',
  apiKey: 'unused-in-local-mode',
  endpoint: 'https://collector.invalid',
  delivery: 'local',
});

rainy.hooks.on('event:tracked', (event) => {
  localAuditLog.append(event);
});
```

In `local` mode, sanitization, observation, hooks, counters, activators, error
fingerprints, and snapshots work normally, but the SDK performs no HTTP.

Use `delivery: 'remote'` with an actual Rainy telemetry collector to enable
batch delivery, circuit breaking, and offline buffering.

## Errors and product events

```typescript
try {
  await runAgent();
} catch (error) {
  rainy.telemetry.captureError(error, {
    context: 'agent-loop',
    severity: 'error',
    tags: ['agent', 'tool-loop'],
    extra: { mode: 'auto' },
  });
}

rainy.telemetry.track('review.completed', {
  findingCount: 8,
  durationBucket: '10-30s',
});
```

Both APIs are fire-and-forget and never throw into product code.

## Thinking traces

```typescript
await rainy.trace({
  sessionId: rainy.session.id,
  thought:
    'The authentication boundary must be checked before applying the patch.',
  context: {
    stage: 'security-review',
    model: 'openai/gpt-5',
  },
  tags: ['reasoning', 'security'],
});
```

The raw thought is SHA-256 hashed before transport. Context passes through the
same sanitizer used for errors and events. Low-quality traces are dropped using
`minQualityScore`.

## Activators

Activators turn telemetry signals into local product behavior:

```typescript
rainy.addActivator({
  name: 'critical-security-reasoning',
  tags: ['reasoning', 'security', 'critical'],
  onActivate: (trace) => {
    queueHumanReview(trace.id);
  },
});
```

This keeps workflow logic local. The SDK does not ask a provider to own the
client’s internal orchestration.

## Hooks and local snapshots

```typescript
rainy.hooks.on('error:captured', (report) => {
  console.log(report.fingerprint);
});

rainy.hooks.on('event:tracked', (event) => {
  if (event.name === 'operation.completed') {
    // Product-specific integration.
  }
});

console.log(rainy.snapshot());
```

Lifecycle hooks include trace, batch, flush, circuit, offline, error, and event
signals. Observed operations are emitted through `event:tracked` with event
names `operation.started`, `operation.completed`, and `operation.failed`.

## Client-side privacy boundary

Sanitization happens before batching, offline buffering, hooks that receive
transport envelopes, or HTTP:

- home and absolute paths;
- emails;
- IPv4 and IPv6 addresses;
- UUIDs;
- JWTs;
- caller-defined sensitive fields.

```typescript
rainy.telemetry.addScrubber('customerSecret', () => '[REDACTED]');
```

See [ADR-001](./docs/adr-001-client-side-anonymization.md) for the threat model.

## Resilience

Remote delivery provides:

- mixed trace/error/event batching;
- retry with bounded jittered backoff;
- three-state circuit breaker;
- bounded in-memory offline buffer;
- explicit `flush()` and `destroy()`;
- a single unref’d auto-flush timer.

```typescript
await rainy.flush();
const finalState = await rainy.destroy();
```

## Main options

| Option | Default | Purpose |
| --- | --- | --- |
| `clientId` | required | Product/application identity |
| `apiKey` | required | Telemetry collector credential |
| `endpoint` | required | Collector origin |
| `delivery` | `remote` | `remote` or network-free `local` |
| `batchSize` | `25` | Envelopes per batch |
| `flushIntervalMs` | `4000` | Auto-flush interval |
| `maxRetries` | `4` | Collector retries |
| `offlineBufferSize` | `500` | In-memory fallback capacity |
| `minQualityScore` | `0.35` | Trace quality threshold |
| `circuitBreakerThreshold` | `5` | Failures before opening |
| `circuitBreakerResetMs` | `15000` | Half-open probe delay |

## What Rainy deliberately does not do

- It does not provide `chat.completions.create`.
- It does not replace provider streaming.
- It does not execute tools or own agent loops.
- It does not capture prompts, outputs, code, or tool arguments automatically.
- It does not hide provider-specific controls behind a lowest-common-denominator
  API.

Use the best provider SDK for model calls. Use Rainy for the operational and
product intelligence around those calls.

## Development

```bash
bun install
bun run typecheck
bun run test
bun run build
npm pack --dry-run
```

## License

Apache-2.0 © ferxalbs
