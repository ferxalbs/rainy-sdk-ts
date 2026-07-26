import type { TraceRecord } from '../types/public.js';

/**
 * Collects TraceRecord objects and emits fixed-size batches.
 */
export class Batcher {
  readonly #batchSize: number;
  readonly #pending: TraceRecord[] = [];

  constructor(batchSize: number) {
    this.#batchSize = batchSize;
  }

  get pendingCount(): number {
    return this.#pending.length;
  }

  /** Add a record; returns a full batch if threshold is reached, else null. */
  add(record: TraceRecord): TraceRecord[] | null {
    this.#pending.push(record);
    if (this.#pending.length >= this.#batchSize) {
      return this.flush();
    }
    return null;
  }

  /** Force-flush all pending records regardless of batch size. */
  flush(): TraceRecord[] {
    const batch = this.#pending.splice(0, this.#pending.length);
    return batch;
  }
}
