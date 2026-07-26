import { sha256Hex } from '../crypto/hasher.js';
import { makeFingerprint } from '../types/branded.js';
import type { Fingerprint } from '../types/branded.js';

/**
 * Collapse a stack into a path-independent shape for fingerprinting.
 * Keeps function names and relative frame structure; strips absolute paths.
 */
export function normalizeStackShape(stack: string | undefined): string {
  if (stack === undefined || stack.length === 0) return '';

  const lines = stack.split('\n');
  const shaped: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    // Drop the first "Error: message" header line from shapes when present
    if (/^(?:[A-Za-z]*Error|Error):/.test(line) && !line.includes('at ')) {
      continue;
    }

    let s = line;
    // Node-style: at fn (path:line:col) or at path:line:col
    s = s.replace(
      /\((?:[A-Za-z]:)?[^)]+[/\\]([^/\\)]+:\d+:\d+)\)/g,
      '($1)',
    );
    s = s.replace(
      /(?:[A-Za-z]:)?(?:\/(?:Users|home)\/[^/:\s]+|(?:\/[^/:\s]+)+)[/\\]([^/\\:\s]+:\d+:\d+)/g,
      '$1',
    );
    // Already-scrubbed path tokens
    s = s.replace(/<HOME>(?:\/[^/:\s]*)*\/([^/:\s]+:\d+:\d+)/g, '$1');
    s = s.replace(/<PATH:([^>]+)>/g, '$1');
    // Collapse remaining absolute-ish segments
    s = s.replace(/(?:\/[\w.-]+){2,}\//g, '');
    shaped.push(s);
  }

  return shaped.join('\n');
}

/**
 * Normalize message text so whitespace noise does not fragment fingerprints.
 */
export function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

/**
 * Fingerprint = SHA-256 of name + message + stack shape.
 * Stable across machines after path scrubbing/normalization.
 */
export function fingerprintError(
  name: string,
  message: string,
  stack: string | undefined,
): Fingerprint {
  const shape = normalizeStackShape(stack);
  const material = `${name}\0${normalizeMessage(message)}\0${shape}`;
  return makeFingerprint(sha256Hex(material));
}

// ── Dedup cache ──────────────────────────────────────────────────────────────

export interface DedupEntry {
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export type DedupDecision =
  | { emit: true; count: number }
  | { emit: false; count: number };

/**
 * In-process error fingerprint deduplication.
 * First sighting emits; repeats inside the TTL window are suppressed.
 * LRU eviction when capacity is exceeded.
 */
export class DedupCache {
  readonly #windowMs: number;
  readonly #maxEntries: number;
  readonly #map = new Map<string, DedupEntry>();

  constructor(windowMs: number, maxEntries: number) {
    this.#windowMs = windowMs;
    this.#maxEntries = maxEntries;
  }

  get size(): number {
    return this.#map.size;
  }

  /**
   * Record a fingerprint sighting.
   * Returns whether a full error report should be enqueued.
   */
  shouldEmit(fp: Fingerprint, now: number = Date.now()): DedupDecision {
    this.#evictExpired(now);

    const key = fp as string;
    const existing = this.#map.get(key);

    if (existing === undefined) {
      this.#insert(key, {
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      return { emit: true, count: 1 };
    }

    // Outside window → treat as fresh
    if (now - existing.firstSeenAt > this.#windowMs) {
      this.#map.delete(key);
      this.#insert(key, {
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      return { emit: true, count: 1 };
    }

    existing.count += 1;
    existing.lastSeenAt = now;
    // Refresh LRU order
    this.#map.delete(key);
    this.#map.set(key, existing);
    return { emit: false, count: existing.count };
  }

  clear(): void {
    this.#map.clear();
  }

  #insert(key: string, entry: DedupEntry): void {
    if (this.#map.size >= this.#maxEntries) {
      // Evict oldest (first inserted in Map iteration order)
      const oldest = this.#map.keys().next().value;
      if (oldest !== undefined) this.#map.delete(oldest);
    }
    this.#map.set(key, entry);
  }

  #evictExpired(now: number): void {
    if (this.#windowMs <= 0) return;
    for (const [key, entry] of this.#map) {
      if (now - entry.firstSeenAt > this.#windowMs) {
        this.#map.delete(key);
      }
    }
  }
}
