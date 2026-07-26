import { randomUUID } from 'node:crypto';
import { makeTraceId } from '../types/branded.js';
import { anonymize } from '../pipeline/anonymizer.js';
import { scoreTrace } from '../pipeline/scorer.js';
import type { TraceInput, TraceRecord } from '../types/public.js';
import type { ClientId } from '../types/branded.js';

/**
 * Builds a fully processed TraceRecord from raw TraceInput.
 * Applies anonymisation and quality scoring.
 */
export function buildTrace(input: TraceInput, clientId: ClientId): TraceRecord {
  const { thoughtHash, context } = anonymize(input);
  const qualityScore = scoreTrace(input);

  return {
    id: makeTraceId(randomUUID()),
    sessionId: input.sessionId,
    clientId,
    thoughtHash,
    context,
    qualityScore,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}
