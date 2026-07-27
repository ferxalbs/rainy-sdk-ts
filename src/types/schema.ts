import { z } from 'zod';

/** Runtime validation of RainyClientOptions at construction time. */
export const ClientOptionsSchema: z.ZodObject<{
  clientId: z.ZodString;
  apiKey: z.ZodString;
  endpoint: z.ZodURL;
  delivery: z.ZodDefault<z.ZodEnum<{
    remote: 'remote';
    local: 'local';
  }>>;
  batchSize: z.ZodDefault<z.ZodNumber>;
  flushIntervalMs: z.ZodDefault<z.ZodNumber>;
  maxRetries: z.ZodDefault<z.ZodNumber>;
  offlineBufferSize: z.ZodDefault<z.ZodNumber>;
  minQualityScore: z.ZodDefault<z.ZodNumber>;
  circuitBreakerThreshold: z.ZodDefault<z.ZodNumber>;
  circuitBreakerResetMs: z.ZodDefault<z.ZodNumber>;
  telemetry: z.ZodOptional<
    z.ZodObject<{
      dedupeWindowMs: z.ZodOptional<z.ZodNumber>;
      dedupeMaxEntries: z.ZodOptional<z.ZodNumber>;
      maxStringBytes: z.ZodOptional<z.ZodNumber>;
      maxEventNameLength: z.ZodOptional<z.ZodNumber>;
      builtInScrubbers: z.ZodOptional<z.ZodBoolean>;
    }>
  >;
}> = z.object({
  clientId: z.string().min(1),
  apiKey: z.string().min(1),
  endpoint: z.url(),
  delivery: z.enum(['remote', 'local']).default('remote'),
  batchSize: z.number().int().min(1).max(500).default(25),
  flushIntervalMs: z.number().int().min(500).default(4_000),
  maxRetries: z.number().int().min(0).max(10).default(4),
  offlineBufferSize: z.number().int().min(1).max(10_000).default(500),
  minQualityScore: z.number().min(0).max(1).default(0.35),
  circuitBreakerThreshold: z.number().int().min(1).default(5),
  circuitBreakerResetMs: z.number().int().min(1_000).default(15_000),
  telemetry: z
    .object({
      dedupeWindowMs: z.number().int().min(0).max(3_600_000).optional(),
      dedupeMaxEntries: z.number().int().min(1).max(10_000).optional(),
      maxStringBytes: z.number().int().min(64).max(1_048_576).optional(),
      maxEventNameLength: z.number().int().min(1).max(512).optional(),
      builtInScrubbers: z.boolean().optional(),
    })
    .optional(),
});

export type ValidatedOptions = z.output<typeof ClientOptionsSchema>;
