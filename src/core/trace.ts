import { randomUUID } from 'node:crypto';
import { makeTraceId } from '../types/branded.js';
import { sha256Hex } from '../crypto/hasher.js';
import { anonymizeContext } from '../pipeline/anonymizer.js';
import { scoreTrace } from '../pipeline/scorer.js';
import type { TraceInput, TraceRecord } from '../types/public.js';
import type { ClientId } from '../types/branded.js';

export function buildTrace(
  input: TraceInput,
  clientId: ClientId,
  startedAt?: number,
): TraceRecord {
  const record: TraceRecord = {
    id: makeTraceId(randomUUID()),
    sessionId: input.sessionId,
    clientId,
    thoughtHash: sha256Hex(input.thought),
    context: anonymizeContext(input.context ?? {}),
    tags: input.tags ?? [],
    qualityScore: scoreTrace(input),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
  if (startedAt !== undefined) {
    record.durationMs = Date.now() - startedAt;
  }
  return record;
}
