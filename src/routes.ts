/**
 * Single source of truth for every relative API path the SDK may call.
 * Application code configures `endpoint` once; transport joins base + these constants.
 * Never hardcode path strings outside this module.
 */
export const ROUTES = {
  traces: '/v1/traces',
  telemetry: {
    errors: '/v3.8/telemetry/errors',
    events: '/v3.8/telemetry/events',
    health: '/v3.8/telemetry/health',
  },
} as const;

export type Routes = typeof ROUTES;
export type TraceRoute = typeof ROUTES.traces;
export type TelemetryRouteKey = keyof typeof ROUTES.telemetry;
export type TelemetryRoute = (typeof ROUTES.telemetry)[TelemetryRouteKey];

/** Join a configured base endpoint with a route constant (no string-built paths elsewhere). */
export function joinEndpoint(endpoint: string, route: string): string {
  const base = endpoint.replace(/\/+$/, '');
  const path = route.startsWith('/') ? route : `/${route}`;
  return `${base}${path}`;
}
