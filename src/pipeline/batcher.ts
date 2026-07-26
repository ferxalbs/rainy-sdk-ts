import type { BatchEnvelope } from '../types/public.js';

/**
 * Size-threshold batch accumulator for mixed-kind envelopes
 * (traces, errors, events).
 */
export class Batcher {
  readonly #size: number;
  readonly #buf: BatchEnvelope[] = [];

  constructor(size: number) {
    this.#size = size;
  }

  get pendingCount(): number {
    return this.#buf.length;
  }

  /** Returns a full batch when threshold is hit, otherwise null. */
  add(envelope: BatchEnvelope): BatchEnvelope[] | null {
    this.#buf.push(envelope);
    return this.#buf.length >= this.#size ? this.flush() : null;
  }

  flush(): BatchEnvelope[] {
    return this.#buf.splice(0, this.#buf.length);
  }
}
