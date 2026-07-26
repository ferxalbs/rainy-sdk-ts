/**
 * Atomic-style monotonic counter backed by a plain number.
 * Fast path: no locks needed in single-threaded Node.js.
 */
export class Counter {
  readonly name: string;
  #value = 0;

  constructor(name: string) { this.name = name; }

  get value(): number { return this.#value; }

  inc(): void          { this.#value++; }
  add(n: number): void { this.#value += n; }
  reset(): void        { this.#value = 0; }

  toJSON() { return { name: this.name, value: this.#value }; }
}
