import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RainyClient,
  extractAiResponseTelemetry,
} from '../src/index.js';

const clients: RainyClient[] = [];

function makeClient(): RainyClient {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        items?: unknown[];
        traces?: unknown[];
      };
      const accepted = body.items?.length ?? body.traces?.length ?? 0;
      return new Response(JSON.stringify({ accepted, rejected: 0 }), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const client = new RainyClient({
    clientId: 'mate-x',
    apiKey: 'test-key',
    endpoint: 'https://telemetry.rainy.test',
    flushIntervalMs: 60_000,
    maxRetries: 0,
  });
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.destroy()));
  vi.unstubAllGlobals();
});

describe('Telemetry.observe', () => {
  it('supports local-only delivery for embedded product logic', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network must not be used');
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new RainyClient({
      clientId: 'mate-x',
      apiKey: 'unused-in-local-mode',
      endpoint: 'https://telemetry.rainy.test',
      delivery: 'local',
      flushIntervalMs: 60_000,
    });
    clients.push(client);

    await client.telemetry.observe('mate.local.analysis', async () => 'ok', {
      kind: 'workflow',
    });
    await client.flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.snapshot().counters['local.accepted']).toBe(1);
  });

  it('returns the original result and tracks safe extracted metadata', async () => {
    const client = makeClient();
    const tracked = vi.fn();
    client.hooks.on('event:tracked', tracked);
    const original = {
      id: 'chat-1',
      choices: [{ message: { content: 'private generated code' } }],
    };

    const result = await client.telemetry.observe(
      'mate.review.generate',
      async () => original,
      {
        kind: 'llm',
        attributes: {
          feature: 'code-review',
          workspace: '/Users/fer/private/repository',
          status: 'caller-cannot-override',
        },
        extractResult: () => ({
          model: 'openai/gpt-5',
          totalTokens: 42,
          operation: 'extractor-cannot-override',
        }),
      },
    );

    expect(result).toBe(original);
    const event = tracked.mock.calls[0]?.[0] as {
      name: string;
      properties: Record<string, unknown>;
    };
    expect(event.name).toBe('operation.completed');
    expect(event.properties).toMatchObject({
      operation: 'mate.review.generate',
      kind: 'llm',
      status: 'ok',
      feature: 'code-review',
      model: 'openai/gpt-5',
      totalTokens: 42,
    });
    expect(event.properties.workspace).not.toContain('/Users/fer');
    expect(JSON.stringify(event)).not.toContain('private generated code');
  });

  it('captures failure metadata and rethrows the identical error', async () => {
    const client = makeClient();
    const tracked = vi.fn();
    const captured = vi.fn();
    client.hooks.on('event:tracked', tracked);
    client.hooks.on('error:captured', captured);
    const failure = Object.assign(new Error('provider failed'), {
      code: 'SERVICE_BUSY',
      status: 503,
    });

    let thrown: unknown;
    try {
      await client.telemetry.observe(
        'mate.agent.turn',
        async () => {
          throw failure;
        },
        { kind: 'workflow' },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
    const failedEvent = tracked.mock.calls[0]?.[0] as {
      name: string;
      properties: Record<string, unknown>;
    };
    expect(failedEvent.name).toBe('operation.failed');
    expect(failedEvent.properties).toMatchObject({
      errorName: 'Error',
      errorCode: 'SERVICE_BUSY',
      errorStatus: 503,
    });
    expect(captured).toHaveBeenCalledOnce();
  });

  it('does not let a broken extractor affect application logic', async () => {
    const client = makeClient();
    const tracked = vi.fn();
    client.hooks.on('event:tracked', tracked);

    const result = await client.telemetry.observe(
      'custom.operation',
      () => Promise.resolve('application-result'),
      {
        extractResult: () => {
          throw new Error('extractor bug');
        },
      },
    );

    expect(result).toBe('application-result');
    expect(tracked.mock.calls[0]?.[0]).toMatchObject({
      properties: { telemetryExtractionFailed: true },
    });
  });
});

describe('extractAiResponseTelemetry', () => {
  it('extracts usage, tools, and Rainy billing without content', () => {
    const result = extractAiResponseTelemetry({
      data: {
        id: 'resp-1',
        object: 'chat.completion',
        model: 'openai/gpt-5',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: 'secret code',
              tool_calls: [{ id: 'call-1' }, { id: 'call-2' }],
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
          prompt_tokens_details: { cached_tokens: 5 },
          completion_tokens_details: { reasoning_tokens: 4 },
        },
      },
      response: new Response(null, {
        headers: {
          'x-request-id': 'req-1',
          'x-rainy-billing-plan': 'pro',
          'x-rainy-credits-charged': '0.0125',
          'x-rainy-daily-credits-remaining': '99.5',
        },
      }),
    });

    expect(result).toEqual({
      responseId: 'resp-1',
      responseType: 'chat.completion',
      model: 'openai/gpt-5',
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      cachedTokens: 5,
      reasoningTokens: 4,
      toolCallCount: 2,
      finishReasons: ['tool_calls'],
      requestId: 'req-1',
      billingPlan: 'pro',
      creditsCharged: 0.0125,
      dailyCreditsRemaining: 99.5,
    });
    expect(JSON.stringify(result)).not.toContain('secret code');
  });

  it('supports Responses and Anthropic usage shapes', () => {
    expect(
      extractAiResponseTelemetry({
        id: 'response-2',
        type: 'response',
        output: [{ type: 'function_call' }],
        usage: {
          input_tokens: 7,
          output_tokens: 3,
          output_tokens_details: { reasoning_tokens: 2 },
        },
      }),
    ).toMatchObject({
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10,
      reasoningTokens: 2,
      toolCallCount: 1,
    });

    expect(
      extractAiResponseTelemetry({
        id: 'msg-1',
        type: 'message',
        content: [{ type: 'tool_use' }],
        usage: { input_tokens: 8, output_tokens: 4 },
      }),
    ).toMatchObject({
      inputTokens: 8,
      outputTokens: 4,
      toolCallCount: 1,
    });
  });
});
