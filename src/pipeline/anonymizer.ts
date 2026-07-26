import { getDefaultSanitizer } from '../telemetry/sanitizer.js';

/**
 * Context PII redaction for traces.
 * Delegates to the shared {@link Sanitizer} so traces and telemetry share
 * one privacy policy (paths, emails, IPs, UUIDs, JWTs, home dirs).
 */
export function anonymizeContext(
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  return getDefaultSanitizer().scrubRecord(ctx);
}
