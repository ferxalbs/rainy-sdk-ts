import { randomUUID } from 'node:crypto';
import { makeSessionId } from '../types/branded.js';
import type { SessionId } from '../types/branded.js';

/**
 * Manages the lifecycle of a single analytics session.
 * Sessions are ephemeral by default (in-memory UUID).
 */
export class RainySession {
  readonly #id: SessionId;
  readonly #createdAt: string;
  #active: boolean = true;

  constructor(id?: SessionId) {
    this.#id = id ?? makeSessionId(randomUUID());
    this.#createdAt = new Date().toISOString();
  }

  get id(): SessionId {
    return this.#id;
  }

  get createdAt(): string {
    return this.#createdAt;
  }

  get isActive(): boolean {
    return this.#active;
  }

  end(): void {
    this.#active = false;
  }

  toJSON(): { id: SessionId; createdAt: string; active: boolean } {
    return {
      id: this.#id,
      createdAt: this.#createdAt,
      active: this.#active,
    };
  }
}
