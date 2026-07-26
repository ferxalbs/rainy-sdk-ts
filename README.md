# rainy-sdk-ts

> TypeScript SDK for [Rainy API](https://rainy.enosis.dev) — anonymous thinking-trace collection with batching, retry, offline buffer and quality scoring.

## Features

- 🔒 **Zero runtime dependencies** — only `devDependencies` for build tooling
- 🏷️ **Branded types** — `TraceId`, `SessionId`, `ClientId` prevent ID mix-ups at compile time
- 🔏 **Private fields** (`#`) — encapsulated internal state, no accidental mutation
- 📦 **Batching** — collects traces and flushes in configurable batches
- 🔄 **Retry with backoff** — exponential backoff on transient HTTP errors
- 📴 **Offline buffer** — queues traces when network is unavailable, replays on reconnect
- 🧮 **Quality scoring** — scores traces before submission to filter low-signal data
- 🔐 **Anonymisation pipeline** — hashes PII before leaving the client

## Installation

```bash
npm install rainy-sdk-ts
# or
bun add rainy-sdk-ts
```

## Quick Start

```typescript
import { RainyClient } from 'rainy-sdk-ts';

const client = new RainyClient({
  clientId: 'YOUR_CLIENT_ID',
  apiKey:   'YOUR_API_KEY',
  endpoint: 'https://api.rainy.enosis.dev',
});

await client.trace({
  sessionId: client.session.id,
  thought:   'The user asked about X, I should check Y first',
  context:   { taskType: 'reasoning' },
});

// Flush remaining traces before process exit
await client.flush();
```

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | required | Your Rainy client ID |
| `apiKey` | `string` | required | Your Rainy API key |
| `endpoint` | `string` | required | Rainy API base URL |
| `batchSize` | `number` | `20` | Max traces per batch |
| `flushIntervalMs` | `number` | `5000` | Auto-flush interval (ms) |
| `maxRetries` | `number` | `3` | HTTP retry attempts |
| `offlineBufferSize` | `number` | `200` | Max offline-queued traces |
| `minQualityScore` | `number` | `0.4` | Minimum score to submit |

## Architecture

```
src/
├── types/
│   ├── branded.ts      # TraceId, SessionId, ClientId branded types
│   ├── public.ts       # Public API surface types
│   └── internal.ts     # Internal types (not exported)
├── core/
│   ├── client.ts       # RainyClient — main entry point
│   ├── session.ts      # Session lifecycle management
│   └── trace.ts        # Trace record builder
├── crypto/
│   └── hasher.ts       # SHA-256 anonymisation helpers
├── pipeline/
│   ├── anonymizer.ts   # PII anonymisation pipeline
│   ├── scorer.ts       # Quality scorer
│   └── batcher.ts      # Trace batcher
└── transport/
    ├── http.ts         # HTTP transport with retry
    └── offline.ts      # Offline buffer & replay
```

## License

Apache-2.0 © ferxalbs
