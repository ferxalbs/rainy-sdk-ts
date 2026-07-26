import type { TraceRecord } from './public.js';

/** Internal queue entry wrapping a trace record with retry metadata. */
export interface QueueEntry {
  record: TraceRecord;
  attempts: number;
  nextAttemptAt: number;
}

/** Serialised offline buffer persisted between process restarts (future). */
export interface OfflineSnapshot {
  version: 1;
  entries: QueueEntry[];
  savedAt: string;
}

/** Raw HTTP response shape expected from Rainy API. */
export interface ApiResponse {
  ok: boolean;
  accepted: number;
  rejected: number;
  errors?: string[];
}
