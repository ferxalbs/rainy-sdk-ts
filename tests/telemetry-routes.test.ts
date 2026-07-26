import { describe, it, expect, vi, afterEach } from 'vitest';
import { ROUTES, joinEndpoint } from '../src/routes.js';
import { TELEMETRY_ROUTES } from '../src/telemetry/routes.js';
import { HttpTransport, routeFor } from '../src/transport/http.js';
import type { BatchEnvelope } from '../src/types/public.js';
import { makeClientId, makeErrorId, makeEventId, makeFingerprint, makeSessionId, makeTraceId } from '../src/types/branded.js';

describe('ROUTES / TELEMETRY_ROUTES', () => {
  it('exposes the expected relative paths', () => {
    expect(ROUTES.traces).toBe('/v1/traces');
    expect(TELEMETRY_ROUTES.errors).toBe('/v3.8/telemetry/errors');
    expect(TELEMETRY_ROUTES.events).toBe('/v3.8/telemetry/events');
    expect(TELEMETRY_ROUTES.health).toBe('/v3.8/telemetry/health');
  });

  it('TELEMETRY_ROUTES is the same object as ROUTES.telemetry', () => {
    expect(TELEMETRY_ROUTES).toBe(ROUTES.telemetry);
  });

  it('joinEndpoint strips trailing slashes and joins once', () => {
    expect(joinEndpoint('https://api.example.com/', ROUTES.traces)).toBe(
      'https://api.example.com/v1/traces',
    );
    expect(joinEndpoint('https://api.example.com', TELEMETRY_ROUTES.errors)).toBe(
      'https://api.example.com/v3.8/telemetry/errors',
    );
  });
});

describe('routeFor', () => {
  it('maps kinds to route constants only', () => {
    expect(routeFor('trace')).toBe(ROUTES.traces);
    expect(routeFor('error')).toBe(TELEMETRY_ROUTES.errors);
    expect(routeFor('event')).toBe(TELEMETRY_ROUTES.events);
  });
});

describe('HttpTransport URL resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs each kind to endpoint + route constant (no hardcoded full URLs)', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          body: JSON.parse(String(init?.body ?? '{}')),
        });
        return new Response(
          JSON.stringify({ ok: true, accepted: 1, rejected: 0 }),
          { status: 200 },
        );
      }),
    );

    const transport = new HttpTransport({
      endpoint: 'https://api.rainy.test',
      apiKey: 'k',
      maxRetries: 0,
    });

    const batch: BatchEnvelope[] = [
      {
        kind: 'trace',
        id: makeTraceId('t1'),
        createdAt: Date.now(),
        payload: {
          id: makeTraceId('t1'),
          sessionId: makeSessionId('s'),
          clientId: makeClientId('c'),
          thoughtHash: 'h',
          context: {},
          tags: [],
          qualityScore: 1,
          timestamp: new Date().toISOString(),
        },
      },
      {
        kind: 'error',
        id: makeErrorId('e1'),
        createdAt: Date.now(),
        payload: {
          id: makeErrorId('e1'),
          fingerprint: makeFingerprint('f'.repeat(64)),
          name: 'Error',
          message: 'x',
          severity: 'error',
          tags: [],
          extra: {},
          occurrenceCount: 1,
          clientId: makeClientId('c'),
          sessionId: makeSessionId('s'),
          timestamp: new Date().toISOString(),
          runtime: { node: 'v22', platform: 'darwin' },
        },
      },
      {
        kind: 'event',
        id: makeEventId('ev1'),
        createdAt: Date.now(),
        payload: {
          id: makeEventId('ev1'),
          name: 'feature_used',
          properties: { feature: 'diff-view' },
          clientId: makeClientId('c'),
          sessionId: makeSessionId('s'),
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await transport.send(batch);
    expect(result.submitted).toBe(3);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.rainy.test/v1/traces',
      'https://api.rainy.test/v3.8/telemetry/errors',
      'https://api.rainy.test/v3.8/telemetry/events',
    ]);
    expect(calls[0]!.body).toHaveProperty('traces');
    expect(calls[1]!.body).toHaveProperty('items');
    expect(calls[2]!.body).toHaveProperty('items');
  });
});
