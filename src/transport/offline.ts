import type { BatchEnvelope } from '../types/public.js';
import type { QueueEntry } from '../types/internal.js';

export class OfflineBuffer {
  readonly #max: number;
  readonly #q: QueueEntry[] = [];

  constructor(max: number) {
    this.#max = max;
  }

  get size(): number {
    return this.#q.length;
  }

  get isFull(): boolean {
    return this.#q.length >= this.#max;
  }

  enqueue(envelope: BatchEnvelope): boolean {
    if (this.isFull) return false;
    this.#q.push({ envelope, attempts: 0, nextAttemptAt: 0 });
    return true;
  }

  drain(now: number = Date.now()): BatchEnvelope[] {
    const out: BatchEnvelope[] = [];
    for (const e of this.#q) {
      if (e.nextAttemptAt <= now) {
        e.attempts++;
        e.nextAttemptAt = now + Math.min(500 * 2 ** e.attempts, 30_000);
        out.push(e.envelope);
      }
    }
    return out;
  }

  acknowledge(ids: Set<string>): void {
    for (let i = this.#q.length - 1; i >= 0; i--) {
      if (ids.has(this.#q[i]!.envelope.id)) this.#q.splice(i, 1);
    }
  }

  clear(): void {
    this.#q.length = 0;
  }
}
