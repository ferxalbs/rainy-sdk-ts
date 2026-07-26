import { bench, describe } from 'vitest';
import { scoreTrace } from '../src/pipeline/scorer.js';
import { sha256Hex } from '../src/crypto/hasher.js';
import { anonymizeContext } from '../src/pipeline/anonymizer.js';
import { Batcher } from '../src/pipeline/batcher.js';
import { makeSessionId } from '../src/types/branded.js';

const sid = makeSessionId('bench');
const richThought =
  'I need to carefully analyse the user authentication state. ' +
  'First check the JWT expiry. Then verify claims. Finally return the user object.';

describe('hot path benchmarks', () => {
  bench('sha256Hex', () => {
    sha256Hex(richThought);
  });

  bench('scoreTrace', () => {
    scoreTrace({ sessionId: sid, thought: richThought, context: { a: 1, b: 2 } });
  });

  bench('anonymizeContext — no PII', () => {
    anonymizeContext({ step: 'auth', model: 'gpt-4o', env: 'prod' });
  });

  bench('anonymizeContext — with email', () => {
    anonymizeContext({ user: 'alice@example.com', step: 'pay' });
  });

  bench('Batcher.add (no flush)', () => {
    const b = new Batcher(1000);
    // @ts-expect-error minimal record for bench
    b.add({ id: 'x', tags: [], qualityScore: 0.8 });
  });
});
