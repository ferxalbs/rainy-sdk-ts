import { afterEach, describe, expect, it, vi } from 'vitest';
import { RainyClient } from '../src/index.js';

describe('feedback and consented training APIs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps consent, capture, and like as separate explicit operations', async () => {
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined;
        calls.push({ url, method: String(init?.method), ...(body ? { body } : {}) });

        if (url.endsWith('/consents')) {
          return Response.json({
            success: true,
            data: {
              consent: {
                id: '11111111-1111-4111-8111-111111111111',
                purpose: 'model_training',
                status: 'granted',
                policy_version: '2026-07',
                granted_at: new Date().toISOString(),
                expires_at: null,
              },
            },
          });
        }
        if (url.endsWith('/captures')) {
          return Response.json({
            success: true,
            data: {
              capture: {
                id: '22222222-2222-4222-8222-222222222222',
                captured_at: new Date().toISOString(),
                expires_at: new Date().toISOString(),
                sanitization_version: '2026-07-1',
              },
            },
          });
        }
        return Response.json({
          success: true,
          data: { feedbackId: 'feedback-1', promoted: true },
        });
      }),
    );

    const client = new RainyClient({
      clientId: 'mate-x',
      apiKey: 'rainy-key',
      endpoint: 'https://api.rainy.test',
      flushIntervalMs: 60_000,
    });
    const consent = await client.telemetry.grantTrainingConsent({
      subjectId: 'customer-42',
      policyVersion: '2026-07',
    });
    const capture = await client.telemetry.captureTrainingExample({
      consentId: consent.id,
      requestId: 'request-1',
      prompt: 'Review this function',
      response: 'One issue was found',
    });
    const feedback = await client.telemetry.sendFeedback({
      feedbackId: 'feedback-1',
      captureId: capture.id,
      rating: 'like',
      category: 'code-review',
    });

    expect(feedback.promoted).toBe(true);
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.rainy.test/api/v1/training/consents',
      'https://api.rainy.test/api/v1/training/captures',
      'https://api.rainy.test/api/v1/telemetry/feedback',
    ]);
    expect(calls[0]!.body).toMatchObject({
      subjectId: 'customer-42',
      purpose: 'model_training',
    });
    expect(calls[2]!.body).toMatchObject({
      rating: 'like',
      captureId: capture.id,
      sessionId: client.session.id,
    });
    await client.destroy();
  });

  it('does not expose remote consent APIs in local delivery mode', async () => {
    const client = new RainyClient({
      clientId: 'mate-x',
      apiKey: 'unused',
      endpoint: 'https://collector.invalid',
      delivery: 'local',
    });
    await expect(
      client.telemetry.grantTrainingConsent({
        subjectId: 'customer-42',
        policyVersion: '2026-07',
      }),
    ).rejects.toThrow(/delivery is local/);
    await client.destroy();
  });

  it('retries transient writes with the same idempotent consent id', async () => {
    const ids: string[] = [];
    let attempt = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { consentId: string };
        ids.push(body.consentId);
        attempt += 1;
        if (attempt === 1) return new Response(null, { status: 503 });
        return Response.json({
          success: true,
          data: {
            consent: {
              id: body.consentId,
              purpose: 'model_training',
              status: 'granted',
              policy_version: '2026-07',
              granted_at: new Date().toISOString(),
              expires_at: null,
            },
          },
        });
      }),
    );

    const client = new RainyClient({
      clientId: 'mate-x',
      apiKey: 'rainy-key',
      endpoint: 'https://api.rainy.test',
      flushIntervalMs: 60_000,
      maxRetries: 1,
    });
    const consent = await client.telemetry.grantTrainingConsent({
      subjectId: 'customer-42',
      policyVersion: '2026-07',
    });

    expect(consent.id).toBe(ids[0]);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    await client.destroy();
  });
});
