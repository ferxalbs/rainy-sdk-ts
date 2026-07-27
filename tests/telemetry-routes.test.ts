import { describe, it, expect, vi, afterEach } from 'vitest';
import { ROUTES, joinEndpoint } from '../src/routes.js';
import { TELEMETRY_ROUTES } from '../src/telemetry/routes.js';
import { HttpTransport, routeFor } from '../src/transport/http.js';
import type { BatchEnvelope } from '../src/types/public.js';
import { makeClientId, makeErrorId, makeEventId, makeFingerprint, makeSessionId, makeTraceId } from '../src/types/branded.js';

describe('ROUTES / TELEMETRY_ROUTES', () => {
  it('exposes the expected relative paths', () => {
    expect(TELEMETRY_ROUTES.batches).toBe('/api/v1/telemetry/batches');
    expect(TELEMETRY_ROUTES.publicErrors).toBe('/api/v1/telemetry/public/errors');
    expect(TELEMETRY_ROUTES.sessions).toBe('/api/v1/telemetry/sessions');
    expect(TELEMETRY_ROUTES.feedback).toBe('/api/v1/telemetry/feedback');
    expect(ROUTES.training.consents).toBe('/api/v1/training/consents');
    expect(ROUTES.training.captures).toBe('/api/v1/training/captures');
  });

  it('TELEMETRY_ROUTES is the same object as ROUTES.telemetry', () => {
    expect(TELEMETRY_ROUTES).toBe(ROUTES.telemetry);
  });

  it('joinEndpoint strips trailing slashes and joins once', () => {
    expect(joinEndpoint('https://api.example.com/', TELEMETRY_ROUTES.batches)).toBe(
      'https://api.example.com/api/v1/telemetry/batches',
    );
    expect(joinEndpoint('https://api.example.com', ROUTES.training.consents)).toBe(
      'https://api.example.com/api/v1/training/consents',
    );
  });
});

describe('routeFor', () => {
  it('maps kinds to route constants only', () => {
    expect(routeFor('trace')).toBe(TELEMETRY_ROUTES.batches);
    expect(routeFor('error')).toBe(TELEMETRY_ROUTES.batches);
    expect(routeFor('event')).toBe(TELEMETRY_ROUTES.batches);
  });
});

describe('HttpTransport URL resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs mixed envelopes once to the authenticated batch route', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          body: JSON.parse(String(init?.body ?? '{}')),
        });
        return new Response(
          JSON.stringify({ success: true, accepted: 3, rejected: 0 }),
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
      'https://api.rainy.test/api/v1/telemetry/batches',
    ]);
    expect(calls[0]!.body).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ kind: 'trace' }),
        expect.objectContaining({ kind: 'error' }),
        expect.objectContaining({ kind: 'event' }),
      ]),
    });
  });
});
