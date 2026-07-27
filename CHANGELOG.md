# CHANGELOG

All notable changes to **rainy-sdk-ts** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.4.0] — 2026-07-26

### Added

- `telemetry.observe(name, operation, options)` for instrumenting provider SDK
  calls, tools, workflows, embeddings, or arbitrary product logic without
  changing their result/error contract.
- Structural `extractAiResponseTelemetry()` adapter for OpenAI-, Anthropic-, and
  Rainy-shaped responses. It extracts tokens, cache/reasoning usage, tool counts,
  finish reasons, and Rainy billing headers without inspecting content.
- Local-only delivery mode for embedded products that need sanitized hooks,
  counters, fingerprints, activators, and snapshots without network traffic.
- Explicit `grantTrainingConsent`, `captureTrainingExample`, `sendFeedback`,
  and `revokeTrainingConsent` APIs. A like can promote only an actively
  consented encrypted capture.
- Unified authenticated batch delivery through
  `/api/v1/telemetry/batches`, reducing auth and rate-limit work per flush.
- Operation tests covering result transparency, error identity, extractor
  isolation, privacy boundaries, provider response shapes, and local delivery.

### Changed

- Package remains telemetry-first and explicitly does not replace OpenAI,
  Anthropic, or other provider SDKs.
- Package export paths now match the `.mjs` / `.d.mts` artifacts emitted by
  tsdown, so both ESM import and CommonJS require resolve after installation.
- Package version bumped to **0.4.0**.

### Security

- AI metadata extraction never reads prompts, messages, generated text, code,
  repository content, or tool arguments.
- Failed instrumentation and extraction never alter application control flow.

---

## [v0.3.0] — 2026-07-26

### Added

- **Telemetry facade** on `client.telemetry` for error reporting and events:
  - `captureError(error, context?)` — severity (`fatal | error | warning | info`), tags, extra metadata
  - `track(event, properties?)` — schema-light events with generic payload typing
  - `addScrubber(key, scrubber)` / `removeScrubber(key)` — pure property-level redaction hooks
  - `flush()` — delegates to the shared client flush
- **Client-side `Sanitizer`** (`src/telemetry/sanitizer.ts`) run **before** batcher/queue/transport:
  - Built-in scrubbers: home directories, absolute paths, emails, IPv4/IPv6, UUIDs, JWTs
  - Recursive plain-object/array walk with depth/key caps, circular-ref handling, truncation
  - Deterministic, side-effect-free (homedir cached at construction)
- **Error fingerprinting + deduplication** (`src/telemetry/fingerprint.ts`):
  - Path-independent stack shape normalization
  - SHA-256 fingerprint of name + message + stack shape
  - In-process `DedupCache` with TTL window and LRU capacity (configurable)
- **Unified batch envelopes** (`BatchKind`: `trace | error | event`) shared by traces, errors, and events
- **Route table SSoT** (`src/routes.ts` + `src/telemetry/routes.ts`):
  - `ROUTES.traces` → `/v1/traces`
  - `TELEMETRY_ROUTES.errors` → `/v3.8/telemetry/errors`
  - `TELEMETRY_ROUTES.events` → `/v3.8/telemetry/events`
  - `TELEMETRY_ROUTES.health` → `/v3.8/telemetry/health`
  - `joinEndpoint` / `routeFor` — no hardcoded full URLs outside `endpoint` config
- **Multi-kind HTTP transport** — partitions batches by kind and POSTs each partition to its route constant
- **Lifecycle hooks**: `error:captured`, `error:deduped`, `event:tracked`
- **Branded types**: `ErrorId`, `EventId`, `Fingerprint`
- **Client options** `telemetry?: TelemetryOptions` (`dedupeWindowMs`, `dedupeMaxEntries`, `maxStringBytes`, `maxEventNameLength`, `builtInScrubbers`)
- **`RainySdk` export alias** for `RainyClient`
- **ADR** documenting why anonymization is client-side: `docs/adr-001-client-side-anonymization.md`
- Unit tests: fingerprint/dedupe, sanitizer, route resolution, smoke coverage for capture/track

### Changed

- **Breaking:** `client.telemetry` is no longer `TelemetryAggregator`. It is the new `Telemetry` facade (`captureError` / `track` / scrubbers). Local counters remain available via `client.snapshot()`; `TelemetryAggregator`, `Counter`, and `Activator` stay exported for advanced use.
- `Batcher`, `OfflineBuffer`, and `HttpTransport` now operate on `BatchEnvelope` instead of `TraceRecord` only
- Trace context redaction (`pipeline/anonymizer.ts`) delegates to the shared `Sanitizer` (one privacy policy for traces + telemetry)
- Auto-flush timer (`flushIntervalMs`) flushes **all** pending envelopes (traces, errors, events) — still the only implicit network activity; documented in README
- Package version bumped to **0.3.0**
- Vitest config: regular `test` runs only `*.test.ts`; benches stay on `bun run bench`
- Dev dependency: `@types/node` for Node ≥ 22 typechecking
- Typecheck hygiene under `isolatedDeclarations` / `exactOptionalPropertyTypes` (session/counter JSON types, mitt interop, optional field construction)

### Fixed

- Circular references in scrubbed objects no longer expand infinitely (shared `WeakSet` per tree)
- Telemetry methods soft-fail after `destroy()` so process-exit / `uncaughtException` hooks remain safe (trace path still throws)

### Security / privacy

- Paths with usernames (`/Users/…`, `/home/…`, `C:\Users\…`), emails, IPs, UUIDs, and JWTs are redacted **in-process** before enqueue or network I/O
- Privacy threat model and non-goals documented in ADR-001

---

## [v0.2.0] — 2026.07.25

Initial v2 scaffold: thinking traces, quality scoring, activators, counters, hooks, circuit breaker, offline buffer, HTTP retry, Zod client options validation.

### Included

- `RainyClient` with `trace`, `flush`, `snapshot`, `destroy`
- `RainySession`, activators, `TelemetryAggregator` counters
- Pipeline: scorer, batcher, basic context anonymizer (email/UUID/JWT)
- Transport: `HttpTransport` (`/v1/traces`), `OfflineBuffer`, `CircuitBreaker`

---

[v0.3.0]: https://github.com/ferxalbs/rainy-sdk-ts/compare/v0.2.0...v0.3.0
[v0.4.0]: https://github.com/ferxalbs/rainy-sdk-ts/compare/v0.3.0...v0.4.0
[v0.2.0]: https://github.com/ferxalbs/rainy-sdk-ts/releases/tag/v0.2.0
