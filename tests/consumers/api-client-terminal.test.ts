import {describe, expect, it} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';

const deniedBody = (kind: 'html' | 'invalid-json' | 'invalid-envelope', status: number) => {
  const body = kind === 'html' ? '<h1>Private upstream denial</h1>'
    : kind === 'invalid-json' ? '{Private upstream denial' : JSON.stringify({detail: 'Private upstream denial'});
  return new Response(body, {status, headers: {'content-type': kind === 'html' ? 'text/html' : 'application/json'}});
};

describe('#284 terminal browser denials', () => {
  for (const [status, code, terminal] of [[401, 'UNAUTHENTICATED', 'SIGNED_OUT'], [403, 'FORBIDDEN', 'FORBIDDEN']] as const) {
    it.each(['html', 'invalid-json', 'invalid-envelope'] as const)(`keeps HTTP ${status} terminal with a %s response body`, async kind => {
      const api = new HufsApiClient(async () => deniedBody(kind, status));
      await expect(api.owner.getExperiencePortfolio()).rejects.toMatchObject({code, status});
      await expect(api.owner.getExperiencePortfolio()).rejects.not.toMatchObject({message: expect.stringContaining('Private upstream')});
      const session = new OwnerSessionController({getSession: async () => ({actorId: 'OWNER-A', role: 'BETA', schoolMailProofValid: true, betaAllowed: true})});
      await session.initialize();
      const result = await session.runLatest('experience-denial', async signal => {
        try { return await api.owner.getExperiencePortfolio({}, signal); }
        catch (error) {
          // Same recovery split as the experience panel: only 409/503 are local errors.
          if (error && typeof error === 'object' && 'status' in error && (error.status === 409 || error.status === 503)) return {};
          throw error;
        }
      });
      expect(result).toBeNull();
      expect(session.getState().status).toBe(terminal);
    });
  }
});
