import { Counter } from './counter.js';

/**
 * Central registry for all named counters.
 * Provides a single source of truth for the telemetry snapshot.
 */
export class TelemetryAggregator {
  readonly #counters = new Map<string, Counter>();

  counter(name: string): Counter {
    let c = this.#counters.get(name);
    if (!c) {
      c = new Counter(name);
      this.#counters.set(name, c);
    }
    return c;
  }

  allCounters(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.#counters) out[k] = v.value;
    return out;
  }

  resetAll(): void {
    for (const c of this.#counters.values()) c.reset();
  }
}
