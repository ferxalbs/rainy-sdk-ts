import { RainyClient } from '../src/core/client.js';
import { RainySession } from '../src/core/session.js';
import { scoreTrace } from '../src/pipeline/scorer.js';
import { anonymize } from '../src/pipeline/anonymizer.js';
import { Batcher } from '../src/pipeline/batcher.js';
import { OfflineBuffer } from '../src/transport/offline.js';
import { sha256Hex } from '../src/crypto/hasher.js';
import { makeSessionId } from '../src/types/branded.js';

// ── RainySession ────────────────────────────────────────────────────────────

describe('RainySession', () => {
  it('generates a UUID session ID by default', () => {
    const s = new RainySession();
    expect(s.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('starts active and can be ended', () => {
    const s = new RainySession();
    expect(s.isActive).toBe(true);
    s.end();
    expect(s.isActive).toBe(false);
  });
});

// ── sha256Hex ───────────────────────────────────────────────────────────────

describe('sha256Hex', () => {
  it('returns a 64-char hex string', () => {
    expect(sha256Hex('hello')).toHaveLength(64);
  });

  it('is deterministic', () => {
    expect(sha256Hex('rainy')).toBe(sha256Hex('rainy'));
  });
});

// ── scoreTrace ──────────────────────────────────────────────────────────────

describe('scoreTrace', () => {
  it('returns 0 for trivially short thoughts', () => {
    expect(scoreTrace({ sessionId: makeSessionId('s'), thought: 'hi' })).toBe(0);
  });

  it('returns > 0.4 for a rich trace', () => {
    const score = scoreTrace({
      sessionId: makeSessionId('s'),
      thought:
        'I should analyse the user request carefully. First I will check the database. Then I will format the response correctly.',
      context: { taskType: 'reasoning', model: 'gpt-4', userId: 'u1' },
    });
    expect(score).toBeGreaterThan(0.4);
  });
});

// ── anonymize ───────────────────────────────────────────────────────────────

describe('anonymize', () => {
  it('replaces thought with a hash', () => {
    const raw = 'top secret reasoning';
    const { thoughtHash } = anonymize({ sessionId: makeSessionId('s'), thought: raw });
    expect(thoughtHash).not.toContain('top secret');
    expect(thoughtHash).toHaveLength(64);
  });

  it('hashes email-like context values', () => {
    const { context } = anonymize({
      sessionId: makeSessionId('s'),
      thought: 'x'.repeat(20),
      context: { user: 'alice@example.com', task: 'reasoning' },
    });
    expect(context['user']).not.toBe('alice@example.com');
    expect(context['task']).toBe('reasoning');
  });
});

// ── Batcher ─────────────────────────────────────────────────────────────────

describe('Batcher', () => {
  const makeRecord = (n: number) =>
    ({
      id: `trace-${n}` as any,
      sessionId: makeSessionId('s'),
      clientId: 'c' as any,
      thoughtHash: 'h',
      context: {},
      qualityScore: 0.8,
      timestamp: new Date().toISOString(),
    }) as any;

  it('returns null until batch is full', () => {
    const b = new Batcher(3);
    expect(b.add(makeRecord(1))).toBeNull();
    expect(b.add(makeRecord(2))).toBeNull();
    const batch = b.add(makeRecord(3));
    expect(batch).toHaveLength(3);
  });

  it('flush() returns all pending records', () => {
    const b = new Batcher(10);
    b.add(makeRecord(1));
    b.add(makeRecord(2));
    expect(b.flush()).toHaveLength(2);
    expect(b.pendingCount).toBe(0);
  });
});

// ── OfflineBuffer ───────────────────────────────────────────────────────────

describe('OfflineBuffer', () => {
  const makeRecord = (id: string) =>
    ({
      id,
      sessionId: makeSessionId('s'),
      clientId: 'c' as any,
      thoughtHash: 'h',
      context: {},
      qualityScore: 0.8,
      timestamp: new Date().toISOString(),
    }) as any;

  it('respects max size', () => {
    const buf = new OfflineBuffer(2);
    expect(buf.enqueue(makeRecord('a'))).toBe(true);
    expect(buf.enqueue(makeRecord('b'))).toBe(true);
    expect(buf.enqueue(makeRecord('c'))).toBe(false);
    expect(buf.size).toBe(2);
  });

  it('drain() returns all ready records', () => {
    const buf = new OfflineBuffer(10);
    buf.enqueue(makeRecord('x'));
    expect(buf.drain(Date.now() + 1000)).toHaveLength(1);
  });
});

// ── RainyClient (unit, no network) ─────────────────────────────────────────

describe('RainyClient', () => {
  it('exposes a default session', () => {
    const client = new RainyClient({
      clientId: 'test-client',
      apiKey: 'test-key',
      endpoint: 'https://api.rainy.test',
    });
    expect(client.session).toBeInstanceOf(RainySession);
    expect(client.session.isActive).toBe(true);
    void client.destroy();
  });

  it('throws after destroy', async () => {
    const client = new RainyClient({
      clientId: 'test-client',
      apiKey: 'test-key',
      endpoint: 'https://api.rainy.test',
    });
    await client.destroy();
    await expect(
      client.trace({
        sessionId: makeSessionId('s'),
        thought: 'x'.repeat(50),
      }),
    ).rejects.toThrow('destroyed');
  });
});
