import { sha256Short } from '../crypto/hasher.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE  = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const JWT_RE   = /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function anonymizeContext(
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === 'string' &&
        (EMAIL_RE.test(v) || UUID_RE.test(v) || JWT_RE.test(v))) {
      out[k] = `[redacted:${sha256Short(v)}]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}
