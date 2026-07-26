import { createHash } from 'node:crypto';

/**
 * Hashes a string with SHA-256 and returns the hex digest.
 * Used to anonymise raw thought text before transmission.
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Deterministic token-level hash — hashes each whitespace-separated token
 * independently and rejoins. Useful for structure-preserving anonymisation.
 */
export function tokenHash(input: string): string {
  return input
    .split(/\s+/)
    .map((token) => sha256Hex(token).slice(0, 8))
    .join(' ');
}
