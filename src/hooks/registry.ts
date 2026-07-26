import mitt from 'mitt';
import type { HookEvent, HookHandler } from '../types/public.js';

type Events = Record<HookEvent, unknown>;

/**
 * Thin wrapper over `mitt` providing typed hook registration.
 * Hooks are fire-and-forget — async handlers are not awaited
 * to avoid blocking the hot trace path.
 */
export class HookRegistry {
  readonly #emitter = mitt<Events>();

  on<E extends HookEvent>(event: E, handler: HookHandler<Events[E]>): void {
    this.#emitter.on(event, handler as (payload: Events[E]) => void);
  }

  off<E extends HookEvent>(event: E, handler: HookHandler<Events[E]>): void {
    this.#emitter.off(event, handler as (payload: Events[E]) => void);
  }

  /** @internal — called by RainyClient internals only */
  emit<E extends HookEvent>(event: E, payload: Events[E]): void {
    this.#emitter.emit(event, payload);
  }
}
