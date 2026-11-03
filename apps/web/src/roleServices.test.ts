import {describe, expect, it, vi} from 'vitest';
import {HufsApiError} from './integrations/index.js';
import {resolveSessionRole, roleServices} from './roleServices.js';

const BETA = {actorId: 'A1', role: 'BETA', schoolMailProofValid: true, betaAllowed: true} as const;
const REVIEWER = {role: 'REVIEWER', accessEndsAt: '2026-12-09T00:00:00.000Z', dataMode: 'SYNTHETIC', readOnly: false, sandboxOnly: true} as const;

function fakeApi(session: () => Promise<unknown>, caps: () => Promise<{actions: string[]}>) {
  return {
    getSession: vi.fn(session), loadReviewerCapabilities: vi.fn(caps),
    readReviewerActions: vi.fn(), saveReviewerAction: vi.fn(),
    getDemoOverlay: vi.fn(), setDemoOverlay: vi.fn(), resetDemoOverlay: vi.fn(),
    owner: {readDemoProfile: vi.fn(), saveDemoProfile: vi.fn(), resetDemoProfile: vi.fn(),
      getDoubleMajor: vi.fn(),checkStudyPlan: vi.fn(),checkMajorWhatIf: vi.fn()},
  } as never as Parameters<typeof roleServices>[0] & Record<string, ReturnType<typeof vi.fn>>;
}
const down = () => Promise.reject(new HufsApiError('PROVIDER_UNAVAILABLE', 503));

describe('#85 role-gated ports: only a confirmed BETA gets the overlay', () => {
  it('REVIEWER + capabilities 503: no overlay is installed and /api/demo/overlay is never called', async () => {
    const api = fakeApi(async () => REVIEWER, down);
    const role = await resolveSessionRole(api);
    expect(role).toEqual({role: 'REVIEWER', sandbox: null});
    const services = roleServices(api, role);
    expect(services.overlay).toBeUndefined();
    expect(services.ownerDemoProfile).toBeUndefined();
    expect(services.ownerAcademics).toBeUndefined();
    expect(services.sandbox).toBeUndefined();
    expect(api.getDemoOverlay).not.toHaveBeenCalled();
  });

  it('session 503 / 401 is UNKNOWN, never BETA', async () => {
    for (const fail of [down, () => Promise.reject(new HufsApiError('UNAUTHENTICATED', 401))]) {
      const api = fakeApi(fail, async () => ({actions: []}));
      const role = await resolveSessionRole(api);
      expect(role).toEqual({role: 'UNKNOWN'});
      expect(roleServices(api, role)).toEqual({});
      expect(api.loadReviewerCapabilities).not.toHaveBeenCalled();
    }
  });

  it('REVIEWER recovers cleanly: a later start with capabilities gets the sandbox only', async () => {
    const api = fakeApi(async () => REVIEWER, async () => ({actions: ['BOOKMARK']}));
    const services = roleServices(api, await resolveSessionRole(api));
    expect(services.overlay).toBeUndefined();
    expect(services.ownerDemoProfile).toBeUndefined();
    expect(services.ownerAcademics).toBeUndefined();
    expect([...services.sandbox!.allowedActions]).toEqual(['BOOKMARK']);
  });

  it('confirmed BETA gets the overlay and never touches reviewer endpoints', async () => {
    const api = fakeApi(async () => BETA, async () => ({actions: []}));
    const services = roleServices(api, await resolveSessionRole(api));
    expect(services.overlay).toBeDefined();
    expect(services.ownerDemoProfile).toBeDefined();
    expect(services.ownerAcademics).toBeDefined();
    expect(services.ownerAcademics?.session).toBe(services.ownerDemoProfile?.session);
    expect(services.ownerDemoProfile?.session.getState().status).toBe('IDLE');
    expect(services.sandbox).toBeUndefined();
    expect(api.loadReviewerCapabilities).not.toHaveBeenCalled();
  });
});
