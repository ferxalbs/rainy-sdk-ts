import { ROUTES } from '../routes.js';
import type { Routes } from '../routes.js';

/**
 * Telemetry-only route table. Re-exports the package-wide SSoT slice so
 * telemetry modules never import path literals.
 */
export const TELEMETRY_ROUTES: Routes['telemetry'] = ROUTES.telemetry;

export type { TelemetryRoute, TelemetryRouteKey } from '../routes.js';
