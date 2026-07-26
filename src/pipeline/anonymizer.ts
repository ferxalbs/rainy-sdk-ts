import { sha256Hex } from '../crypto/hasher.js';
import type { TraceInput } from '../types/public.js';

export interface AnonymisedThought {
  thoughtHash: string;
  context: Record<string, unknown>;
}

/**
 * Anonymises a TraceInput before it leaves the client.
 *
 * - `thought` is replaced with its SHA-256 hash (raw text never transmitted)
 * - `context` values that are strings and look like emails/UUIDs are hashed
 */
export function anonymize(input: TraceInput): AnonymisedThought {
  return {
    thoughtHash: sha256Hex(input.thought),
    context: anonymizeContext(input.context ?? {}),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function anonymizeContext(
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === 'string' && (EMAIL_RE.test(v) || UUID_RE.test(v))) {
      out[k] = sha256Hex(v).slice(0, 16);
    } else {
      out[k] = v;
    }
  }
  return out;
}
