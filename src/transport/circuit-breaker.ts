type CBState = 'closed' | 'open' | 'half-open';

/**
 * Classic 3-state circuit breaker.
 * closed → open after `threshold` consecutive failures.
 * open   → half-open after `resetMs`.
 * half-open → closed on first success, open on failure.
 */
export class CircuitBreaker {
  readonly #threshold: number;
  readonly #resetMs:   number;
  readonly #onChange:  (s: CBState) => void;

  #state:      CBState = 'closed';
  #failures    = 0;
  #openedAt    = 0;

  constructor(
    threshold: number,
    resetMs:   number,
    onChange:  (s: CBState) => void = () => {},
  ) {
    this.#threshold = threshold;
    this.#resetMs   = resetMs;
    this.#onChange  = onChange;
  }

  get state(): CBState { return this.#currentState(); }
  get isOpen(): boolean { return this.#currentState() === 'open'; }

  record(success: boolean): void {
    const s = this.#currentState();

    if (success) {
      this.#failures = 0;
      if (s !== 'closed') this.#transition('closed');
      return;
    }

    this.#failures++;
    if (s === 'closed' && this.#failures >= this.#threshold) {
      this.#openedAt = Date.now();
      this.#transition('open');
    } else if (s === 'half-open') {
      this.#openedAt = Date.now();
      this.#transition('open');
    }
  }

  #currentState(): CBState {
    if (this.#state === 'open' && Date.now() - this.#openedAt >= this.#resetMs) {
      this.#state = 'half-open';
    }
    return this.#state;
  }

  #transition(next: CBState): void {
    this.#state = next;
    this.#onChange(next);
  }
}
