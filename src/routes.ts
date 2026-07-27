/**
 * Single source of truth for every relative API path the SDK may call.
 * Application code configures `endpoint` once; transport joins base + these constants.
 * Never hardcode path strings outside this module.
 */
export const ROUTES = {
  telemetry: {
    batches: '/api/v1/telemetry/batches',
    publicErrors: '/api/v1/telemetry/public/errors',
    sessions: '/api/v1/telemetry/sessions',
    feedback: '/api/v1/telemetry/feedback',
  },
  training: {
    consents: '/api/v1/training/consents',
    captures: '/api/v1/training/captures',
  },
} as const;

export type Routes = typeof ROUTES;
export type TelemetryRouteKey = keyof typeof ROUTES.telemetry;
export type TelemetryRoute = (typeof ROUTES.telemetry)[TelemetryRouteKey];

/** Join a configured base endpoint with a route constant (no string-built paths elsewhere). */
export function joinEndpoint(endpoint: string, route: string): string {
  const base = endpoint.replace(/\/+$/, '');
  const path = route.startsWith('/') ? route : `/${route}`;
  return `${base}${path}`;
}
