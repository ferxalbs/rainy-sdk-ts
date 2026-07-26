import { homedir } from 'node:os';
import type { Scrubber } from './types.js';

const MAX_DEPTH = 8;
const MAX_KEYS = 64;
const MAX_ARRAY = 64;

/** Email — embedded or whole-value. */
const EMAIL_RE =
  /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

/** UUID v1–v5 (and general 8-4-4-4-12). */
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** JWT-shaped three-segment base64url. */
const JWT_RE =
  /\bey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

/** IPv4. */
const IPV4_RE =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;

/** IPv6 (simplified, covers common forms). */
const IPV6_RE =
  /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi;

/** Unix absolute paths (not starting with //). */
const UNIX_ABS_RE = /(?:^|[\s"'(`=])(\/(?:Users|home|var|tmp|opt|etc|usr|private)\/[^\s"'`)}\],:]+)/g;

/** Generic remaining unix absolute paths with file extension or deep nesting. */
const UNIX_ABS_GENERIC_RE = /(?:^|[\s"'(`=])(\/(?:[^/\s"'`)}\],:]+)(?:\/[^/\s"'`)}\],:]+)+)/g;

/** Windows absolute paths. */
const WIN_ABS_RE =
  /(?:^|[\s"'(`=])([A-Za-z]:\\(?:Users|users|WINDOWS|Windows|Program Files|Temp)[^\\s"'`)}\],:]*)/g;

const WIN_ABS_GENERIC_RE =
  /(?:^|[\s"'(`=])([A-Za-z]:\\(?:[^\\s"'`)}\],:]+\\)+[^\\s"'`)}\],:]+)/g;

export interface SanitizerOptions {
  /** Enable built-in string scrubbers. @default true */
  builtInScrubbers?: boolean;
  /** Max characters retained after scrub. @default 8192 */
  maxStringBytes?: number;
  /**
   * Home directory used for path redaction.
   * Defaults to `os.homedir()` once at construction (cached).
   */
  homeDir?: string;
}

/**
 * Client-side anonymization pipeline.
 * Deterministic, side-effect-free (aside from reading homedir once at construct).
 * Runs BEFORE anything reaches the batcher/queue.
 */
export class Sanitizer {
  readonly #builtIn: boolean;
  readonly #maxString: number;
  readonly #homeDir: string;
  readonly #homePatterns: readonly RegExp[];
  readonly #keyScrubbers = new Map<string, Scrubber>();

  constructor(opts: SanitizerOptions = {}) {
    this.#builtIn = opts.builtInScrubbers ?? true;
    this.#maxString = opts.maxStringBytes ?? 8_192;
    this.#homeDir = normalizeHome(opts.homeDir ?? safeHomedir());
    this.#homePatterns = buildHomePatterns(this.#homeDir);
  }

  /** Register a pure key-level scrubber (runs after built-ins). */
  addScrubber(key: string, scrubber: Scrubber): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('addScrubber: key must be a non-empty string');
    }
    if (typeof scrubber !== 'function') {
      throw new TypeError('addScrubber: scrubber must be a function');
    }
    this.#keyScrubbers.set(key, scrubber);
  }

  removeScrubber(key: string): void {
    this.#keyScrubbers.delete(key);
  }

  hasScrubber(key: string): boolean {
    return this.#keyScrubbers.has(key);
  }

  /**
   * Scrub a free-form string (messages, stack lines, property values).
   * Order is fixed for determinism: home → abs paths → email → ip → uuid → jwt → truncate.
   */
  scrubString(input: string): string {
    if (typeof input !== 'string' || input.length === 0) return input;
    if (!this.#builtIn) return truncate(input, this.#maxString);

    let s = input;

    for (const re of this.#homePatterns) {
      s = s.replace(re, (match, path: string) => {
        const prefix = match.slice(0, match.length - path.length);
        return `${prefix}<HOME>${path.slice(this.#homeDir.length)}`;
      });
    }

    // Known unix roots with context capture
    s = s.replace(UNIX_ABS_RE, (match, path: string) => {
      const prefix = match.slice(0, match.length - path.length);
      return `${prefix}${redactPath(path)}`;
    });
    s = s.replace(UNIX_ABS_GENERIC_RE, (match, path: string) => {
      if (path.startsWith('<')) return match;
      const prefix = match.slice(0, match.length - path.length);
      return `${prefix}${redactPath(path)}`;
    });
    s = s.replace(WIN_ABS_RE, (match, path: string) => {
      const prefix = match.slice(0, match.length - path.length);
      return `${prefix}${redactPath(path)}`;
    });
    s = s.replace(WIN_ABS_GENERIC_RE, (match, path: string) => {
      if (path.startsWith('<')) return match;
      const prefix = match.slice(0, match.length - path.length);
      return `${prefix}${redactPath(path)}`;
    });

    s = s.replace(EMAIL_RE, '[REDACTED:email]');
    s = s.replace(IPV4_RE, '[REDACTED:ip]');
    s = s.replace(IPV6_RE, '[REDACTED:ip]');
    s = s.replace(UUID_RE, '[REDACTED:uuid]');
    s = s.replace(JWT_RE, '[REDACTED:jwt]');

    return truncate(s, this.#maxString);
  }

  /** Scrub each stack line independently. */
  scrubStack(stack: string | undefined): string | undefined {
    if (stack === undefined || stack.length === 0) return stack;
    const lines = stack.split('\n');
    const out: string[] = [];
    for (const line of lines) {
      out.push(this.scrubString(line));
    }
    return truncate(out.join('\n'), this.#maxString);
  }

  /**
   * Deep-scrub a JSON-like value. Never mutates the input.
   * Functions/symbols dropped; circular refs become `"[Circular]"`.
   */
  scrubValue(value: unknown, key = ''): unknown {
    return this.#walk(value, key, 0, new WeakSet<object>());
  }

  /** Deep-scrub a plain object of properties/context. */
  scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
    // Single WeakSet for the whole tree so circular self-refs resolve correctly.
    const result = this.#walk(record, '', 0, new WeakSet<object>());
    if (isPlainObject(result)) return result;
    return {};
  }

  #walk(
    value: unknown,
    key: string,
    depth: number,
    seen: WeakSet<object>,
  ): unknown {
    if (depth > MAX_DEPTH) return '[MaxDepth]';

    if (value === null || value === undefined) return value;

    const t = typeof value;
    if (t === 'string') {
      let scrubbed: unknown = this.scrubString(value as string);
      const keyFn = this.#keyScrubbers.get(key);
      if (keyFn) scrubbed = keyFn(scrubbed, key);
      return scrubbed;
    }
    if (t === 'number' || t === 'boolean' || t === 'bigint') {
      const keyFn = this.#keyScrubbers.get(key);
      return keyFn ? keyFn(value, key) : value;
    }
    if (t === 'function' || t === 'symbol') return undefined;

    if (t === 'object') {
      const obj = value as object;
      if (seen.has(obj)) return '[Circular]';
      seen.add(obj);

      if (Array.isArray(value)) {
        const arr = value.slice(0, MAX_ARRAY).map((item, i) =>
          this.#walk(item, String(i), depth + 1, seen),
        );
        const keyFn = this.#keyScrubbers.get(key);
        return keyFn ? keyFn(arr, key) : arr;
      }

      if (!isPlainObject(value)) {
        return '[UNSERIALIZABLE]';
      }

      const out: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>).slice(
        0,
        MAX_KEYS,
      );
      for (const [k, v] of entries) {
        const child = this.#walk(v, k, depth + 1, seen);
        if (child !== undefined) out[k] = child;
      }
      const keyFn = this.#keyScrubbers.get(key);
      return keyFn ? keyFn(out, key) : out;
    }

    return '[UNSERIALIZABLE]';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeHomedir(): string {
  try {
    return homedir();
  } catch {
    return '';
  }
}

function normalizeHome(home: string): string {
  if (!home) return '';
  return home.replace(/[/\\]+$/, '');
}

function buildHomePatterns(home: string): RegExp[] {
  if (!home) return [];
  const escaped = escapeRegExp(home);
  // Match the home prefix even when path continues
  return [
    new RegExp(`(${escaped}(?:[/\\\\][^\\s"'\`)}\\],:]*)?)`, 'g'),
  ];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Redact an absolute path while keeping the basename for diagnostics.
 * `/Users/alice/proj/src/app.ts` → `<PATH:app.ts>`
 */
export function redactPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const base = parts[parts.length - 1] ?? 'unknown';
  // Strip query-ish trailing junk from stack frames like `file.ts:12:34`
  const file = base.replace(/:\d+(?::\d+)?$/, (m) => m);
  const name = file.includes(':')
    ? file
    : base;
  return `<PATH:${name}>`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…[truncated]`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Shared default sanitizer used by the legacy anonymizeContext helper. */
let sharedDefault: Sanitizer | undefined;

export function getDefaultSanitizer(): Sanitizer {
  if (!sharedDefault) sharedDefault = new Sanitizer();
  return sharedDefault;
}

/** Test-only: reset the shared default (e.g. after homedir mock). */
export function resetDefaultSanitizer(): void {
  sharedDefault = undefined;
}
