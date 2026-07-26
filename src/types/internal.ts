import type { BatchEnvelope } from './public.js';

export interface QueueEntry {
  envelope: BatchEnvelope;
  attempts: number;
  nextAttemptAt: number;
}

export interface ApiResponse {
  ok: boolean;
  accepted: number;
  rejected: number;
  errors?: string[];
}
