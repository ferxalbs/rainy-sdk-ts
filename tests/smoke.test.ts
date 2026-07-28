import { describe, it, expect, vi, afterEach } from 'vitest';
import { RainySession } from '../src/core/session.js';
import { sha256Hex } from '../src/crypto/hasher.js';
import { scoreTrace } from '../src/pipeline/scorer.js';
import { anonymizeContext } from '../src/pipeline/anonymizer.js';
import { Batcher } from '../src/pipeline/batcher.js';
import { OfflineBuffer } from '../src/transport/offline.js';
import { CircuitBreaker } from '../src/transport/circuit-breaker.js';
import { Counter } from '../src/telemetry/counter.js';
import { Activator } from '../src/telemetry/activator.js';
import { TelemetryAggregator } from '../src/telemetry/aggregator.js';
import { HookRegistry } from '../src/hooks/registry.js';
import { RainyClient, RainySdk } from '../src/index.js';
import {
  makeSessionId,
  makeTraceId,
  makeClientId,
} from '../src/types/branded.js';
import type { BatchEnvelope, TraceRecord } from '../src/types/public.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const sid = makeSessionId('test-session');

const makeRecord = (id: string, tags: string[] = []): TraceRecord => ({
  id: makeTraceId(id),
  sessionId: sid,
  clientId: makeClientId('test'),
  thoughtHash: 'h',
  context: {},
  tags,
  qualityScore: 0.8,
  timestamp: new Date().toISOString(),
});

const makeEnv = (id: string, tags: string[] = []): BatchEnvelope => ({
  kind: 'trace',
  id,
  payload: makeRecord(id, tags),
  createdAt: Date.now(),
});

// ── RainySession ─────────────────────────────────────────────────────────────

describe('RainySession', () => {
  it('auto-generates a UUID', () => {
    expect(new RainySession().id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('tracks uptime', async () => {
    const s = new RainySession();
    await new Promise((r) => setTimeout(r, 5));
    expect(s.uptimeMs).toBeGreaterThan(0);
  });

  it('becomes inactive on end()', () => {
    const s = new RainySession();
    s.end();
    expect(s.isActive).toBe(false);
  });
});

// ── Crypto ───────────────────────────────────────────────────────────────────

describe('sha256Hex', () => {
  it('produces 64-char hex', () => expect(sha256Hex('x')).toHaveLength(64));
  it('is deterministic', () =>
    expect(sha256Hex('rainy')).toBe(sha256Hex('rainy')));
});

// ── Scorer ───────────────────────────────────────────────────────────────────

describe('scoreTrace', () => {
  it('returns 0 for trivial input', () =>
    expect(scoreTrace({ sessionId: sid, thought: 'hi' })).toBe(0));

  it('returns > 0.5 for rich input', () => {
    const s = scoreTrace({
      sessionId: sid,
      thought:
        'I need to check the auth state first. Then query the database. Finally format the response.',
      context: { step: 'auth', model: 'gpt-4o', user: 'u1', env: 'prod' },
    });
    expect(s).toBeGreaterThan(0.5);
  });
});

// ── Anonymizer ───────────────────────────────────────────────────────────────

describe('anonymizeContext', () => {
  it('redacts emails', () => {
    const r = anonymizeContext({ user: 'alice@example.com', task: 'pay' });
    expect(r['user']).toMatch(/REDACTED/);
    expect(r['task']).toBe('pay');
  });

  it('redacts UUIDs', () => {
    const r = anonymizeContext({
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(r['id']).toMatch(/REDACTED/);
  });
});

// ── Batcher ──────────────────────────────────────────────────────────────────

describe('Batcher', () => {
  it('emits batch at threshold', () => {
    const b = new Batcher(3);
    expect(b.add(makeEnv('a'))).toBeNull();
    expect(b.add(makeEnv('b'))).toBeNull();
    expect(b.add(makeEnv('c'))).toHaveLength(3);
  });

  it('flush drains pending', () => {
    const b = new Batcher(10);
    b.add(makeEnv('x'));
    b.add(makeEnv('y'));
    expect(b.flush()).toHaveLength(2);
    expect(b.pendingCount).toBe(0);
  });
});

// ── OfflineBuffer ────────────────────────────────────────────────────────────

describe('OfflineBuffer', () => {
  it('respects max capacity', () => {
    const buf = new OfflineBuffer(2);
    expect(buf.enqueue(makeEnv('a'))).toBe(true);
    expect(buf.enqueue(makeEnv('b'))).toBe(true);
    expect(buf.enqueue(makeEnv('c'))).toBe(false);
  });

  it('drain returns ready envelopes', () => {
    const buf = new OfflineBuffer(5);
    buf.enqueue(makeEnv('x'));
    expect(buf.drain(Date.now() + 9999)).toHaveLength(1);
  });
});

// ── CircuitBreaker ───────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  it('opens after threshold failures', () => {
    const cb = new CircuitBreaker(3, 60_000);
    cb.record(false);
    cb.record(false);
    expect(cb.state).toBe('closed');
    cb.record(false);
    expect(cb.state).toBe('open');
  });

  it('closes on success', () => {
    const cb = new CircuitBreaker(1, 60_000);
    cb.record(false);
    expect(cb.isOpen).toBe(true);
    cb.record(true);
    expect(cb.state).toBe('closed');
  });

  it('transitions to half-open after resetMs', async () => {
    const cb = new CircuitBreaker(1, 10);
    cb.record(false);
    await new Promise((r) => setTimeout(r, 15));
    expect(cb.state).toBe('half-open');
  });

  it('fires onChange callback', () => {
    const fn = vi.fn();
    const cb = new CircuitBreaker(1, 60_000, fn);
    cb.record(false);
    expect(fn).toHaveBeenCalledWith('open');
  });
});

// ── Counter ──────────────────────────────────────────────────────────────────

describe('Counter', () => {
  it('increments and resets', () => {
    const c = new Counter('test');
    c.inc();
    c.inc();
    c.add(3);
    expect(c.value).toBe(5);
    c.reset();
    expect(c.value).toBe(0);
  });
});

// ── Activator ────────────────────────────────────────────────────────────────

describe('Activator', () => {
  it('fires when all tags match', () => {
    const fired = vi.fn();
    const a = new Activator();
    a.add({ name: 'test', tags: ['reasoning', 'critical'], onActivate: fired });
    a.evaluate(makeRecord('r', ['reasoning', 'critical', 'extra']));
    expect(fired).toHaveBeenCalledOnce();
    expect(a.activationCounts()).toEqual({ test: 1 });
  });

  it('does not fire on partial tags', () => {
    const fired = vi.fn();
    const a = new Activator();
    a.add({ name: 'test', tags: ['reasoning', 'critical'], onActivate: fired });
    a.evaluate(makeRecord('r', ['reasoning']));
    expect(fired).not.toHaveBeenCalled();
  });
});

// ── TelemetryAggregator ──────────────────────────────────────────────────────

describe('TelemetryAggregator', () => {
  it('registers and tracks counters', () => {
    const agg = new TelemetryAggregator();
    agg.counter('a').inc();
    agg.counter('a').add(4);
    agg.counter('b').inc();
    expect(agg.allCounters()).toEqual({ a: 5, b: 1 });
  });
});

// ── HookRegistry ─────────────────────────────────────────────────────────────

describe('HookRegistry', () => {
  it('emits and receives events', () => {
    const fn = vi.fn();
    const h = new HookRegistry();
    h.on('trace:after', fn);
    h.emit('trace:after', makeRecord('x') as unknown as undefined);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('off removes handler', () => {
    const fn = vi.fn();
    const h = new HookRegistry();
    h.on('trace:skipped', fn);
    h.off('trace:skipped', fn);
    h.emit('trace:skipped', makeRecord('x') as unknown as undefined);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ── RainyClient integration ───────────────────────────────────────────────────

describe('RainyClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const makeClient = () =>
    new RainyClient({
      clientId: 'test',
      apiKey: 'test-key',
      endpoint: 'https://api.rainy.test',
      flushIntervalMs: 60_000,
      telemetry: { sessionTracking: false },
    });

  it('exposes a live session', () => {
    const c = makeClient();
    expect(c.session.isActive).toBe(true);
    void c.destroy();
  });

  it('RainySdk is an alias of RainyClient', () => {
    expect(RainySdk).toBe(RainyClient);
  });

  it('snapshot has expected keys', () => {
    const c = makeClient();
    const s = c.snapshot();
    expect(s).toHaveProperty('counters');
    expect(s).toHaveProperty('activations');
    expect(s).toHaveProperty('circuitBreakerState', 'closed');
    void c.destroy();
  });

  it('skips low-quality traces and increments counter', async () => {
    const c = makeClient();
    await c.trace({ sessionId: c.session.id, thought: 'hi' });
    expect(c.snapshot().totalSkipped).toBe(1);
    void c.destroy();
  });

  it('activator fires on matching tags', async () => {
    const fired = vi.fn();
    const c = makeClient();
    c.addActivator({ name: 'critical', tags: ['critical'], onActivate: fired });
    await c.trace({
      sessionId: c.session.id,
      thought:
        'This is a critical reasoning step that requires careful analysis of the data.',
      tags: ['critical'],
    });
    expect(fired).toHaveBeenCalledOnce();
    void c.destroy();
  });

  it('throws after destroy on trace', async () => {
    const c = makeClient();
    await c.destroy();
    await expect(
      c.trace({ sessionId: c.session.id, thought: 'x'.repeat(50) }),
    ).rejects.toThrow('destroyed');
  });

  it('hook fires on trace:before', async () => {
    const fn = vi.fn();
    const c = makeClient();
    c.hooks.on('trace:before', fn);
    await c.trace({ sessionId: c.session.id, thought: 'hi' });
    expect(fn).toHaveBeenCalledOnce();
    void c.destroy();
  });

  it('telemetry.captureError enqueues and dedupes', async () => {
    const captured = vi.fn();
    const deduped = vi.fn();
    const c = makeClient();
    c.hooks.on('error:captured', captured);
    c.hooks.on('error:deduped', deduped);

    const err = new Error('boom from capture');
    c.telemetry.captureError(err, { context: 'code_review' });
    c.telemetry.captureError(err, { context: 'code_review' });

    expect(captured).toHaveBeenCalledOnce();
    expect(deduped).toHaveBeenCalledOnce();
    expect(c.snapshot().counters['errors.captured']).toBe(1);
    expect(c.snapshot().counters['errors.deduped']).toBe(1);
    void c.destroy();
  });

  it('telemetry.track records events with scrubbed properties', async () => {
    const tracked = vi.fn();
    const c = makeClient();
    c.hooks.on('event:tracked', tracked);
    c.telemetry.addScrubber('secret', () => '[REDACTED]');
    c.telemetry.track('feature_used', {
      feature: 'diff-view',
      secret: 'token-value',
      email: 'dev@example.com',
    });

    expect(tracked).toHaveBeenCalledOnce();
    const event = tracked.mock.calls[0]![0] as {
      name: string;
      properties: Record<string, unknown>;
    };
    expect(event.name).toBe('feature_used');
    expect(event.properties['feature']).toBe('diff-view');
    expect(event.properties['secret']).toBe('[REDACTED]');
    expect(event.properties['email']).toBe('[REDACTED:email]');
    expect(c.snapshot().counters['events.tracked']).toBe(1);
    void c.destroy();
  });

  it('telemetry soft-fails after destroy', async () => {
    const c = makeClient();
    await c.destroy();
    expect(() => c.telemetry.captureError(new Error('late'))).not.toThrow();
    expect(() => c.telemetry.track('after_destroy')).not.toThrow();
  });

  it('scrubs paths in captured error stacks', () => {
    const captured = vi.fn();
    const c = makeClient();
    c.hooks.on('error:captured', captured);

    const err = new Error('path leak');
    err.stack = `Error: path leak
    at run (/Users/fer/Projects/mate-x/src/run.ts:10:1)`;
    c.telemetry.captureError(err);

    const report = captured.mock.calls[0]![0] as { stack?: string; message: string };
    expect(report.stack ?? '').not.toContain('/Users/fer');
    expect(report.stack ?? '').toMatch(/<HOME>|<PATH:/);
    void c.destroy();
  });
});
