import type { TraceRecord, ActivatorRule } from '../types/public.js';

/**
 * Activator engine — evaluates tag-based rules against incoming traces.
 * Rules fire when ALL specified tags are present in the trace.
 */
export class Activator {
  readonly #rules = new Map<string, ActivatorRule>();
  readonly #counts = new Map<string, number>();

  add(rule: ActivatorRule): void {
    this.#rules.set(rule.name, rule);
    this.#counts.set(rule.name, 0);
  }

  remove(name: string): void {
    this.#rules.delete(name);
    this.#counts.delete(name);
  }

  evaluate(trace: TraceRecord): string[] {
    const fired: string[] = [];
    const tagSet = new Set(trace.tags);

    for (const [name, rule] of this.#rules) {
      if (rule.tags.every(t => tagSet.has(t))) {
        this.#counts.set(name, (this.#counts.get(name) ?? 0) + 1);
        rule.onActivate?.(trace);
        fired.push(name);
      }
    }

    return fired;
  }

  activationCounts(): Record<string, number> {
    return Object.fromEntries(this.#counts);
  }

  resetCounts(): void {
    for (const k of this.#counts.keys()) this.#counts.set(k, 0);
  }
}
