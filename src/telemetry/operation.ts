import type { ErrorContext, TelemetryPayload } from './types.js';

export type TelemetryOperationKind =
  | 'llm'
  | 'embedding'
  | 'tool'
  | 'workflow'
  | 'custom';

export interface ObserveOptions<T> {
  /** Semantic class used for dashboards and local aggregation. @default "custom" */
  kind?: TelemetryOperationKind;
  /** Safe business context. Values pass through the normal sanitizer. */
  attributes?: TelemetryPayload;
  /**
   * Extract metadata from the result without sending prompts or generated text.
   * Extraction failures never affect the wrapped operation.
   */
  extractResult?: (result: T) => TelemetryPayload;
  /** Emit a lightweight start event in addition to the terminal event. @default false */
  trackStart?: boolean;
  /** Capture a sanitized ErrorReport when the operation fails. @default true */
  captureError?: boolean;
  /** Extra classification attached to a captured error. */
  errorContext?: Omit<ErrorContext, 'context' | 'extra'>;
}

export interface AiResponseTelemetry extends TelemetryPayload {
  responseId?: string;
  responseType?: string;
  model?: string;
  provider?: string;
  serviceTier?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  toolCallCount?: number;
  finishReasons?: string[];
  requestId?: string;
  billingPlan?: string;
  creditsCharged?: number;
  dailyCreditsRemaining?: number | 'unlimited';
}

/**
 * Extract safe operational metadata from OpenAI-, Anthropic-, or Rainy-shaped
 * results. It intentionally never reads prompt, message, output text, or code.
 *
 * Supports direct SDK results and `{ data, response }` results returned by
 * OpenAI's `.withResponse()` helper.
 */
export function extractAiResponseTelemetry(
  value: unknown,
): AiResponseTelemetry {
  const outer = asRecord(value);
  const data = asRecord(outer?.data) ?? outer;
  if (data === null) return {};

  const usage = asRecord(data.usage);
  const promptDetails = asRecord(usage?.prompt_tokens_details);
  const inputDetails = asRecord(usage?.input_tokens_details);
  const completionDetails = asRecord(usage?.completion_tokens_details);
  const outputDetails = asRecord(usage?.output_tokens_details);
  const headers = responseHeaders(outer?.response);

  const inputTokens = firstFiniteNumber(
    usage?.input_tokens,
    usage?.prompt_tokens,
  );
  const outputTokens = firstFiniteNumber(
    usage?.output_tokens,
    usage?.completion_tokens,
  );
  const totalTokens =
    firstFiniteNumber(usage?.total_tokens) ??
    (inputTokens !== undefined && outputTokens !== undefined
      ? inputTokens + outputTokens
      : undefined);
  const cachedTokens = firstFiniteNumber(
    inputDetails?.cached_tokens,
    promptDetails?.cached_tokens,
    usage?.cache_read_input_tokens,
  );
  const reasoningTokens = firstFiniteNumber(
    outputDetails?.reasoning_tokens,
    completionDetails?.reasoning_tokens,
  );
  const finishReasons = collectFinishReasons(data);
  const toolCallCount = countToolCalls(data);
  const dailyRemaining = parseCreditsHeader(
    headers?.get('x-rainy-daily-credits-remaining'),
  );

  return compact<Record<string, unknown>>({
    responseId: firstString(data.id),
    responseType: firstString(data.object, data.type),
    model: firstString(data.model),
    provider: firstString(data.provider),
    serviceTier: firstString(
      data.service_tier,
      headers?.get('x-rainy-service-tier'),
    ),
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens,
    reasoningTokens,
    toolCallCount: toolCallCount > 0 ? toolCallCount : undefined,
    finishReasons: finishReasons.length > 0 ? finishReasons : undefined,
    requestId: firstString(headers?.get('x-request-id')),
    billingPlan: firstString(headers?.get('x-rainy-billing-plan')),
    creditsCharged: firstFiniteNumber(
      headers?.get('x-rainy-credits-charged'),
    ),
    dailyCreditsRemaining: dailyRemaining,
  }) as AiResponseTelemetry;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string =>
      typeof value === 'string' && value.length > 0,
  );
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim().length > 0
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function responseHeaders(value: unknown): Headers | null {
  const response = asRecord(value);
  const headers = response?.headers;
  return headers instanceof Headers ? headers : null;
}

function parseCreditsHeader(
  value: string | null | undefined,
): number | 'unlimited' | undefined {
  if (value === 'unlimited') return value;
  return firstFiniteNumber(value);
}

function collectFinishReasons(data: Record<string, unknown>): string[] {
  const values = new Set<string>();
  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    const row = asRecord(choice);
    const reason = firstString(row?.finish_reason, row?.stop_reason);
    if (reason !== undefined) values.add(reason);
  }
  const direct = firstString(data.finish_reason, data.stop_reason);
  if (direct !== undefined) values.add(direct);
  return [...values];
}

function countToolCalls(data: Record<string, unknown>): number {
  let count = 0;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    const message = asRecord(asRecord(choice)?.message);
    if (Array.isArray(message?.tool_calls)) count += message.tool_calls.length;
  }
  const output = Array.isArray(data.output) ? data.output : [];
  count += output.filter((item) => {
    const type = asRecord(item)?.type;
    return type === 'function_call' || type === 'tool_use';
  }).length;
  const content = Array.isArray(data.content) ? data.content : [];
  count += content.filter((item) => asRecord(item)?.type === 'tool_use').length;
  return count;
}

function compact<T extends TelemetryPayload>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as T;
}
