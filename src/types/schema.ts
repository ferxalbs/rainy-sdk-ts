import { z } from 'zod';

/** Runtime validation of RainyClientOptions at construction time. */
export const ClientOptionsSchema = z.object({
  clientId:                  z.string().min(1),
  apiKey:                    z.string().min(1),
  endpoint:                  z.url(),
  batchSize:                 z.number().int().min(1).max(500).default(25),
  flushIntervalMs:           z.number().int().min(500).default(4_000),
  maxRetries:                z.number().int().min(0).max(10).default(4),
  offlineBufferSize:         z.number().int().min(1).max(10_000).default(500),
  minQualityScore:           z.number().min(0).max(1).default(0.35),
  circuitBreakerThreshold:   z.number().int().min(1).default(5),
  circuitBreakerResetMs:     z.number().int().min(1_000).default(15_000),
});

export type ValidatedOptions = z.output<typeof ClientOptionsSchema>;
