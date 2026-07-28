import { afterEach, describe, expect, it, vi } from 'vitest';
import { RainyClient, SDK_VERSION } from '../src/index.js';

describe('automatic session lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports start and completion without exposing duration policy', async () => {
    const calls: Array<{
      url: string;
      headers: Headers;
      body: Record<string, unknown>;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        });
        return new Response(JSON.stringify({ success: true, data: { sessionId: 'db-id' } }));
      }),
    );

    const client = new RainyClient({
      clientId: 'mate-x',
      apiKey: 'rainy-key',
      endpoint: 'https://api.rainy.test',
      flushIntervalMs: 60_000,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await client.destroy();

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.rainy.test/api/v1/telemetry/sessions',
      'https://api.rainy.test/api/v1/telemetry/sessions',
    ]);
    expect(calls[0]!.body).toMatchObject({
      sessionId: client.session.id,
      clientId: 'mate-x',
      status: 'active',
    });
    expect(calls[0]!.body).not.toHaveProperty('durationMs');
    expect(calls[1]!.body).toMatchObject({
      sessionId: client.session.id,
      clientId: 'mate-x',
      status: 'completed',
    });
    expect(calls[1]!.body).toHaveProperty('endedAt');
    expect(calls[1]!.headers.get('X-Rainy-SDK')).toBe(
      `rainy-sdk-ts/${SDK_VERSION}`,
    );
  });

  it('never lets collector errors escape into product shutdown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('collector unavailable');
    }));
    const client = new RainyClient({
      clientId: 'mate-x',
      apiKey: 'rainy-key',
      endpoint: 'https://api.rainy.test',
      flushIntervalMs: 60_000,
    });

    await expect(client.destroy()).resolves.toMatchObject({
      submitted: 0,
      failed: 0,
    });
  });

  it('can disable lifecycle network calls while keeping telemetry enabled', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = new RainyClient({
      clientId: 'mate-x',
      apiKey: 'rainy-key',
      endpoint: 'https://api.rainy.test',
      flushIntervalMs: 60_000,
      telemetry: { sessionTracking: false },
    });

    await client.destroy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
