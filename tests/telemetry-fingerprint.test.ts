import { describe, it, expect } from 'vitest';
import {
  fingerprintError,
  normalizeStackShape,
  DedupCache,
} from '../src/telemetry/fingerprint.js';
import { makeFingerprint } from '../src/types/branded.js';

describe('normalizeStackShape', () => {
  it('strips absolute home paths but keeps frame structure', () => {
    const a = normalizeStackShape(
      `Error: boom
    at doWork (/Users/alice/proj/src/app.ts:10:5)
    at main (/Users/alice/proj/src/index.ts:3:1)`,
    );
    const b = normalizeStackShape(
      `Error: boom
    at doWork (/Users/bob/other/src/app.ts:10:5)
    at main (/Users/bob/other/src/index.ts:3:1)`,
    );
    expect(a).toBe(b);
    expect(a).toContain('app.ts:10:5');
    expect(a).not.toContain('/Users/');
  });

  it('handles already-scrubbed paths', () => {
    const shape = normalizeStackShape(
      '    at fn (<PATH:app.ts:10:5>)',
    );
    expect(shape).toContain('app.ts:10:5');
    expect(shape).not.toContain('<PATH:');
  });
});

describe('fingerprintError', () => {
  it('is stable for identical logical errors', () => {
    const fp1 = fingerprintError(
      'TypeError',
      'x is not a function',
      'at f (/Users/a/src/x.ts:1:1)',
    );
    const fp2 = fingerprintError(
      'TypeError',
      'x is not a function',
      'at f (/Users/b/src/x.ts:1:1)',
    );
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64);
  });

  it('differs when messages differ', () => {
    const a = fingerprintError('Error', 'one', 'at f (x.ts:1:1)');
    const b = fingerprintError('Error', 'two', 'at f (x.ts:1:1)');
    expect(a).not.toBe(b);
  });

  it('normalizes whitespace in messages', () => {
    const a = fingerprintError('Error', 'hello   world', undefined);
    const b = fingerprintError('Error', 'hello world', undefined);
    expect(a).toBe(b);
  });
});

describe('DedupCache', () => {
  it('emits on first sighting and suppresses within window', () => {
    const cache = new DedupCache(60_000, 64);
    const fp = makeFingerprint('abc');
    const t0 = 1_000_000;

    expect(cache.shouldEmit(fp, t0)).toEqual({ emit: true, count: 1 });
    expect(cache.shouldEmit(fp, t0 + 100)).toEqual({ emit: false, count: 2 });
    expect(cache.shouldEmit(fp, t0 + 200)).toEqual({ emit: false, count: 3 });
  });

  it('emits again after TTL window expires', () => {
    const cache = new DedupCache(1_000, 64);
    const fp = makeFingerprint('xyz');
    const t0 = 1_000_000;

    expect(cache.shouldEmit(fp, t0).emit).toBe(true);
    expect(cache.shouldEmit(fp, t0 + 500).emit).toBe(false);
    expect(cache.shouldEmit(fp, t0 + 1_001).emit).toBe(true);
  });

  it('evicts oldest when capacity exceeded', () => {
    const cache = new DedupCache(60_000, 2);
    const t0 = 1_000_000;
    cache.shouldEmit(makeFingerprint('1'), t0);
    cache.shouldEmit(makeFingerprint('2'), t0);
    expect(cache.size).toBe(2);
    cache.shouldEmit(makeFingerprint('3'), t0);
    expect(cache.size).toBe(2);
    // fingerprint 1 was evicted → emits again
    expect(cache.shouldEmit(makeFingerprint('1'), t0 + 1).emit).toBe(true);
  });
});
