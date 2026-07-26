import type { TraceRecord } from '../types/public.js';

export class Batcher {
  readonly #size: number;
  readonly #buf: TraceRecord[] = [];

  constructor(size: number) { this.#size = size; }

  get pendingCount(): number { return this.#buf.length; }

  /** Returns a full batch when threshold is hit, otherwise null. */
  add(record: TraceRecord): TraceRecord[] | null {
    this.#buf.push(record);
    return this.#buf.length >= this.#size ? this.flush() : null;
  }

  flush(): TraceRecord[] {
    return this.#buf.splice(0, this.#buf.length);
  }
}
