# ADR-001: Client-Side Anonymization for Telemetry

**Status:** Accepted  
**Date:** 2026-07-26  
**Module:** `rainy-sdk-ts` / `src/telemetry`

## Context

`rainy-sdk-ts` ships into developer-facing products (MaTE X, Rainy MaTE, CLI tools)
where errors and telemetry events often contain:

- Absolute filesystem paths (including usernames in `/Users/<name>/…`)
- Email addresses and other account identifiers
- IP addresses from local tooling or config dumps
- UUIDs and tokens that can re-identify a session or user

In most observability stacks, redaction is a **server-side** concern: the agent
forwards raw payloads; the collector or backend scrubber sanitizes before storage.

That model is insufficient for this SDK.

## Decision

**All error reports and telemetry events are sanitized inside the SDK process
before they enter the batcher, offline buffer, or HTTP transport.**

The SDK owns its privacy guarantees. It does not rely on the Rainy API (or any
intermediate proxy) to strip PII after the fact.

Concretely:

1. A `Sanitizer` runs on every string (messages, stacks, property values).
2. Built-in scrubbers cover home dirs, absolute paths, emails, IPs, UUIDs, JWTs.
3. Consumers can register pure key-level `Scrubber` functions for domain PII.
4. Error fingerprints are computed **after** stack normalization so machines
   with different home directories still dedupe the same logical fault.
5. Traces reuse the same sanitizer policy via `anonymizeContext`.

## Threat model

Client-side anonymization defends against:

| Threat | How client-side scrubbing helps |
|--------|----------------------------------|
| **Leaked offline buffer / process memory dump** | Payloads already redacted before enqueue; a dump of the queue lacks raw paths/emails. |
| **Debug logging of outbound bodies** | App or middleware that logs the POST body never sees unsanitized PII. |
| **Compromised or over-verbose endpoint** | Even if the telemetry API logs raw request bodies, sensitive fields were stripped at the source. |
| **Multi-tenant log aggregation** | Reduces blast radius if another tenant’s logs or a shared SIEM index the payload. |
| **Support tooling copy-paste** | Support engineers inspecting failed deliveries handle scrubbed data by default. |
| **Transit inspection (beyond TLS endpoints)** | Does not replace TLS; reduces value of any captured ciphertext after decryption at a malicious hop that holds keys. |

### Explicit non-goals

- **Not** a substitute for TLS, API authentication, or least-privilege keys.
- **Not** traffic-metadata anonymity (remote IP, timing, size still visible).
- **Not** server-side DLP — the API may still apply its own policies; this is defense in depth, not mutual exclusion.
- **Not** perfect re-identification resistance against a determined adversary with side channels.

## Why this is atypical — and intentional

Server-only scrubbing optimizes for:

- Central policy updates without client releases
- Richer context for first-line debugging

Those benefits cost **trust in every hop after leave-process**. For an SDK used
in coding agents and IDE-adjacent tools, the cost is wrong:

1. Payloads may sit in in-memory offline queues during outages.
2. Consumers frequently enable verbose HTTP logging during integration.
3. Early API versions and staging endpoints may log more aggressively.
4. The product promise is “your paths and emails never leave the machine in the clear” — that can only be enforced **before** `fetch`.

## Consequences

**Positive**

- Privacy boundary is enforceable and testable in unit tests.
- Dedup fingerprints remain stable across developer machines after path scrub.
- Single policy shared by traces, errors, and events.

**Negative / trade-offs**

- Diagnostic fidelity is intentionally lossy (paths become `<PATH:file.ts>`).
- Policy changes require an SDK release (or consumer custom scrubbers).
- Over-scrubbing can hide useful ops signal — mitigated by keeping basenames
  and allowing severity / tags / non-PII context through.

## Implementation notes

- Sanitizer functions are pure (aside from caching `os.homedir()` at construct).
- Key scrubbers run **after** built-ins so consumers can force full redaction.
- `captureError` / `track` never throw; failures increment drop counters.
- Route constants live in `src/routes.ts`; transport never embeds full URLs.

## References

- `src/telemetry/sanitizer.ts`
- `src/telemetry/error-capture.ts`
- `src/telemetry/event-tracker.ts`
- `src/pipeline/anonymizer.ts`
