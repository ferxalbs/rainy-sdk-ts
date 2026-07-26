import type { TraceRecord } from '../types/public.js';
import type { QueueEntry } from '../types/internal.js';

/**
 * In-memory offline buffer.
 * Holds traces when the HTTP transport is unavailable, replays them on flush.
 */
export class OfflineBuffer {
  readonly #maxSize: number;
  readonly #queue: QueueEntry[] = [];

  constructor(maxSize: number) {
    this.#maxSize = maxSize;
  }

  get size(): number {
    return this.#queue.length;
  }

  get isFull(): boolean {
    return this.#queue.length >= this.#maxSize;
  }

  enqueue(record: TraceRecord): boolean {
    if (this.isFull) return false;
    this.#queue.push({ record, attempts: 0, nextAttemptAt: 0 });
    return true;
  }

  /** Returns all ready-to-retry entries (nextAttemptAt <= now). */
  drain(now = Date.now()): TraceRecord[] {
    const ready: TraceRecord[] = [];
    for (const entry of this.#queue) {
      if (entry.nextAttemptAt <= now) {
        entry.attempts++;
        entry.nextAttemptAt = now + backoff(entry.attempts);
        ready.push(entry.record);
      }
    }
    return ready;
  }

  /** Removes successfully submitted records from the buffer. */
  acknowledge(ids: Set<string>): void {
    const idx = this.#queue.findIndex((e) => ids.has(e.record.id));
    if (idx !== -1) this.#queue.splice(idx, 1);
  }

  clear(): void {
    this.#queue.length = 0;
  }
}

function backoff(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 30_000);
}
