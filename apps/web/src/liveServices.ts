import type {HufsApiClient} from './integrations/index.js';
import type {AppServices} from './App.js';
import {boardPort} from './features/applications/boardPort.js';

/**
 * Real (non-synthetic) data ports. The calendar reads the authorized
 * GET /api/demo/contexts/:id/calendar for the controller's current context only;
 * the widget still validates it against snapshot.asOf and the controller drops
 * responses for an older epoch, context or snapshot. Nothing is cached or stored.
 */
export function liveServices(api: HufsApiClient): AppServices {
  return {loadCalendar: (ctx, signal) => api.getCalendar(ctx.contextId, signal), applications: boardPort(api)};
}
