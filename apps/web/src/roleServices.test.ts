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
      getDoubleMajor: vi.fn(),checkStudyPlan: vi.fn(),checkMajorWhatIf: vi.fn(),getPrivateIntake: vi.fn()},
  } as never as Parameters<typeof roleServices>[0] & Record<string, ReturnType<typeof vi.fn>>;
}
const down = () => Promise.reject(new HufsApiError('PROVIDER_UNAVAILABLE', 503));

describe('#85 role-gated ports: only a confirmed BETA gets the overlay', () => {
  it('connects guide read/save to the confirmed owner API and the shared private session',async()=>{
    const api=fakeApi(async()=>BETA,async()=>({actions:[]}));
    const read=vi.fn(async()=>({state:'NOT_CONNECTED' as const})),save=vi.fn(async()=>({state:'NOT_CONNECTED' as const}));
    api.owner.getOwnerGuideChecklist=read;api.owner.saveOwnerGuideChecklist=save;
    const services=roleServices(api,await resolveSessionRole(api));
    await services.ownerInsights?.readGuide?.('SYN-GUIDE','zh');
    expect(read).toHaveBeenCalledExactlyOnceWith('SYN-GUIDE','zh',undefined);
    const change={expectedVersion:0,locale:'ko' as const,displayedLocale:'ko' as const,guideRevisionId:'SYN-REV',
      translationVersion:'SYN-KO',contextVersion:'a'.repeat(64),checkedStepIds:[]};
    await services.ownerInsights?.saveGuide?.('SYN-GUIDE',change);
    expect(save).toHaveBeenCalledExactlyOnceWith('SYN-GUIDE',change,undefined);
    expect(services.ownerInsights?.session).toBe(services.ownerDemoProfile?.session);
  });
  it('REVIEWER + capabilities 503: no overlay is installed and /api/demo/overlay is never called', async () => {
    const api = fakeApi(async () => REVIEWER, down);
    const role = await resolveSessionRole(api);
    expect(role).toEqual({role: 'REVIEWER', sandbox: null});
    const services = roleServices(api, role);
    expect(services.overlay).toBeUndefined();
    expect(services.ownerDemoProfile).toBeUndefined();
    expect(services.ownerAcademics).toBeUndefined();
    expect(services.ownerClubs).toBeUndefined();
    expect(services.clubModeration).toBeUndefined();
    expect(services.ownerIntake).toBeUndefined();
    expect(services.ownerExperience).toBeUndefined();
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
    expect(services.ownerClubs).toBeUndefined();
    expect(services.clubModeration).toBeUndefined();
    expect([...services.sandbox!.allowedActions]).toEqual(['BOOKMARK']);
  });

  it('confirmed ADMIN receives only publication moderation, never BETA or REVIEWER capabilities', async () => {
    const api = fakeApi(async () => ({...BETA,role:'ADMIN'}), async () => ({actions: []}));
    const role=await resolveSessionRole(api);
    expect(role).toEqual({role:'ADMIN'});
    const services=roleServices(api,role);
    expect(Object.keys(services)).toEqual(['clubModeration']);
    expect(services.clubModeration).toBeDefined();
    expect(api.loadReviewerCapabilities).not.toHaveBeenCalled();
  });

  it('confirmed BETA gets the overlay and never touches reviewer endpoints', async () => {
    const api = fakeApi(async () => BETA, async () => ({actions: []}));
    const services = roleServices(api, await resolveSessionRole(api));
    expect(services.overlay).toBeDefined();
    expect(services.ownerDemoProfile).toBeDefined();
    expect(services.ownerAcademics).toBeDefined();
    expect(services.ownerAcademics?.session).toBe(services.ownerDemoProfile?.session);
    expect(services.ownerIntake).toBeDefined();
    expect(services.ownerExperience).toBeDefined();
    expect(services.ownerExperience?.session).toBe(services.ownerDemoProfile?.session);
    expect(services.ownerIntake?.session).toBe(services.ownerDemoProfile?.session);
    expect(services.ownerClubs?.session).toBe(services.ownerDemoProfile?.session);
    expect(services.clubModeration).toBeUndefined();
    expect(services.ownerDemoProfile?.session.getState().status).toBe('IDLE');
    expect(services.sandbox).toBeUndefined();
    expect(api.loadReviewerCapabilities).not.toHaveBeenCalled();
  });
});
