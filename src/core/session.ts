import { randomUUID } from 'node:crypto';
import { makeSessionId } from '../types/branded.js';
import type { SessionId } from '../types/branded.js';

export class RainySession {
  readonly #id: SessionId;
  readonly #createdAt: number = Date.now();
  #active = true;

  constructor(id?: SessionId) {
    this.#id = id ?? makeSessionId(randomUUID());
  }

  get id(): SessionId { return this.#id; }
  get createdAt(): number { return this.#createdAt; }
  get isActive(): boolean { return this.#active; }
  get uptimeMs(): number { return Date.now() - this.#createdAt; }

  end(): void { this.#active = false; }

  toJSON() {
    return { id: this.#id, createdAt: this.#createdAt, active: this.#active, uptimeMs: this.uptimeMs };
  }
}
