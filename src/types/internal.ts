import type { TraceRecord } from './public.js';

export interface QueueEntry {
  record: TraceRecord;
  attempts: number;
  nextAttemptAt: number;
}

export interface ApiResponse {
  ok: boolean;
  accepted: number;
  rejected: number;
  errors?: string[];
}
