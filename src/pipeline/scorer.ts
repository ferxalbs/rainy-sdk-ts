import type { TraceInput } from '../types/public.js';

/**
 * Quality scorer for thinking traces.
 *
 * Returns a score in [0, 1]. Traces below the client's `minQualityScore`
 * threshold are dropped before batching.
 *
 * Heuristics (additive, each contributes a weight):
 *  - Thought length (longer → higher, saturates at 500 chars)
 *  - Presence of context metadata
 *  - Thought has multiple sentences
 *  - No pure whitespace / trivially short thought
 */
export function scoreTrace(input: TraceInput): number {
  const thought = input.thought.trim();

  if (thought.length < 10) return 0;

  let score = 0;

  // Length component (0–0.4)
  score += Math.min(thought.length / 500, 1) * 0.4;

  // Context richness (0–0.2)
  const contextKeys = Object.keys(input.context ?? {}).length;
  score += Math.min(contextKeys / 5, 1) * 0.2;

  // Multi-sentence bonus (0–0.2)
  const sentences = thought.split(/[.!?]+/).filter((s) => s.trim().length > 3);
  if (sentences.length >= 2) score += 0.2;

  // Vocabulary variety bonus (0–0.2)
  const words = thought.toLowerCase().split(/\s+/);
  const uniqueRatio = new Set(words).size / words.length;
  score += uniqueRatio * 0.2;

  return Math.min(score, 1);
}
