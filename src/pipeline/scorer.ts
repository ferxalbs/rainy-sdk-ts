import type { TraceInput } from '../types/public.js';

/**
 * Lightweight quality scorer.
 * Score in [0, 1] — composite of length, context richness, sentence diversity.
 */
export function scoreTrace(input: TraceInput): number {
  const t = input.thought.trim();
  if (t.length < 10) return 0;

  // Length (0–0.35, saturates at 400 chars)
  const lengthScore = Math.min(t.length / 400, 1) * 0.35;

  // Context richness (0–0.2)
  const ctxScore = Math.min(Object.keys(input.context ?? {}).length / 5, 1) * 0.2;

  // Multi-sentence bonus (0–0.25)
  const sentences = t.split(/[.!?]+/).filter(s => s.trim().length > 4);
  const sentenceScore = Math.min(sentences.length / 3, 1) * 0.25;

  // Lexical variety (0–0.2)
  const words = t.toLowerCase().split(/\s+/);
  const varietyScore = (new Set(words).size / words.length) * 0.2;

  return Math.min(lengthScore + ctxScore + sentenceScore + varietyScore, 1);
}
