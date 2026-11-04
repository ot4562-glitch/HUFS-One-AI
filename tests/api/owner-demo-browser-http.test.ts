import {afterEach, describe, expect, it} from 'vitest';
import {blankDemoProfileValue, blankDemoProfileWorkspace, type DemoProfileRecord, type DemoProfileSave, type DemoProfileReset} from '@hufs-one/contracts';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {DemoProfileConflict, DemoProfileService, type DemoProfileStore} from '../../apps/api/src/modules/profiles/demo-profile.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';

const now = '2026-11-03T00:00:00.000Z';
const origin = 'https://synthetic.invalid';
const beta = {role: 'BETA' as const, actorId: 'SYN-OWNER-A',
  sessionIdHash: 'S'.repeat(32), csrfToken: 'C'.repeat(32), betaAllowed: true,
  sessionExpiresAt: '2026-12-01T00:00:00.000Z',
  schoolMailProofExpiresAt: '2026-12-01T00:00:00.000Z'};
const reviewer = {role: 'REVIEWER' as const, actorId: 'SYN-REVIEWER',
  sessionIdHash: 'R'.repeat(32), csrfToken: 'C'.repeat(32),
  verifiedEmail: 'reviewer@example.invalid',
  identityProofExpiresAt: '2026-12-01T00:00:00.000Z',
  sessionExpiresAt: '2026-12-01T00:00:00.000Z'};
type CurrentActor = typeof beta | typeof reviewer | null;
const data = new Map<string, DemoProfileRecord>();
const empty = (): DemoProfileRecord => ({version: 0, value: blankDemoProfileValue(), workspace: blankDemoProfileWorkspace(), updatedAt: null});
const store: DemoProfileStore = {
  read: async id => structuredClone(data.get(id) ?? empty()),
  save: async (id, input: DemoProfileSave) => {
    const old = data.get(id) ?? empty();
    if (old.version !== input.expectedVersion) throw new DemoProfileConflict();
    const next = {version: old.version + 1, value: input.value, workspace: old.workspace, updatedAt: now};
    data.set(id, next); return structuredClone(next);
  },
  saveWorkspace:async(id,input)=>{
    const old=data.get(id)??empty();
    if(old.version!==input.expectedVersion)throw new DemoProfileConflict();
    const next={...old,version:old.version+1,workspace:input.workspace,updatedAt:now};
    data.set(id,next);return structuredClone(next);
  },
  reset: async (id, input: DemoProfileReset) => {
    const old = data.get(id) ?? empty();
    if (old.version !== input.expectedVersion) throw new DemoProfileConflict();
    const next = {version: old.version + 1, value: blankDemoProfileValue(), workspace: blankDemoProfileWorkspace(), updatedAt: now};
    data.set(id, next); return structuredClone(next);
  },
};
const apps: Array<ReturnType<typeof createIntegratedApi>> = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); data.clear(); });

function harness() {
  let actor: CurrentActor = beta;
  const app = createIntegratedApi({
    allowedOrigin: origin,
    repository: new MemoryApiRepository({profiles: []}),
    auth: {verifySession: async () => actor, revokeSession: async () => {}},
    now: () => now,
    demoProfile: new DemoProfileService(store),
  });
  apps.push(app);
  const client = new HufsApiClient(async (url, init) => {
    const hdr: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { hdr[key] = value; });
    const result = await app.inject({
      method: init.method ?? 'GET', url,
      headers: {...hdr, origin, cookie: 'SYN_SESSION'},
      ...(init.body === undefined ? {} : {payload: JSON.parse(String(init.body))}),
    });
    return new Response(result.body, {
      status: result.statusCode, headers: {'content-type': 'application/json'},
    });
  });
  return {client, setActor: (next: CurrentActor) => { actor = next; }};
}

describe('#132 BETA owner browser→Fastify HTTP→CAS storage full contract', () => {
  it('loads, saves, rereads, resets and rechecks current BETA on each request', async () => {
    const h = harness(), session = new OwnerSessionController(h.client);
    await session.initialize();
    expect(session.getState().status).toBe('READY');
    const initial = await session.runLatest('demo-profile', signal => h.client.owner.readDemoProfile(signal));
    expect(initial?.profile.version).toBe(0);
    const value = {primaryMajor: '가상 정보학', earnedCreditUnits: 0,
      interestTopics: ['AI_ML' as const], doubleMajor: {kind: 'NONE' as const}};
    const saved = await session.runMutation(signal => h.client.owner.saveDemoProfile({
      expectedVersion: 0, value,
    }, signal));
    expect(saved?.profile.value.earnedCreditUnits).toBe(0);
    expect(saved?.profile.version).toBe(1);
    expect(saved?.snapshot.version).toBe(1);
    expect(saved?.snapshot.namespace).toBe('EMPTY_DEMO');
    const reread = await session.runLatest('demo-profile', signal => h.client.owner.readDemoProfile(signal));
    expect(reread).toEqual(saved);
    const reset = await session.runMutation(signal => h.client.owner.resetDemoProfile({expectedVersion: 1}, signal));
    expect(reset?.profile.version).toBe(2);
    expect(reset?.profile.value).toEqual(blankDemoProfileValue());
    expect(reset?.snapshot.version).toBe(2);
  });
  it('writes the workspace through the real client/HTTP middleware, CAS and full reset',async()=>{
    const h=harness(),workspace={...blankDemoProfileWorkspace(),bookmarks:['SYN-OPP-002'],
      experiences:[{id:'SYN-EXP-001',title:'가상 활동',summary:'합성',topicCodes:['AI_ML' as const]}],experienceOverlay:'ON' as const};
    const result=await h.client.owner.saveDemoWorkspace({expectedVersion:0,workspace});
    expect(result.profile.version).toBe(1);expect(result.snapshot.workspace).toEqual(workspace);
    await expect(h.client.owner.saveDemoWorkspace({expectedVersion:0,workspace})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
    const reset=await h.client.owner.resetDemoProfile({expectedVersion:1});
    expect(reset.profile.workspace).toEqual(blankDemoProfileWorkspace());
    expect(reset.snapshot.experienceSignals.mode).toBe('OFF');
    expect(reset.snapshot.calendar.entries.some(e=>e.importance==='SAVED')).toBe(false);
    h.setActor(reviewer);
    await expect(h.client.owner.saveDemoWorkspace({expectedVersion:2,workspace})).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(data.get(beta.actorId)?.workspace).toEqual(blankDemoProfileWorkspace());
  });
  it('server rejects REVIEWER and forged actor in payload, without mutating stored data', async () => {
    const h = harness();
    h.setActor(reviewer);
    await expect(h.client.owner.readDemoProfile()).rejects.toMatchObject({code: 'FORBIDDEN'});
    h.setActor(beta);
    await expect(h.client.owner.saveDemoProfile({expectedVersion: 0, value: {
      primaryMajor: '가상', earnedCreditUnits: 0,
      interestTopics: ['AI_ML'], doubleMajor: {kind: 'NONE'},
      actorId: reviewer.actorId,
    }} as never)).rejects.toMatchObject({code: 'INVALID_INPUT'});
    expect(data.size).toBe(0);
  });
  it('clears the owner session if the validated actor changes between requests', async () => {
    const h = harness(), session = new OwnerSessionController(h.client);
    await session.initialize();
    expect((await session.runLatest('demo-profile', signal => h.client.owner.readDemoProfile(signal)))?.profile.version).toBe(0);
    h.setActor({...beta, actorId: 'SYN-OWNER-B'});
    expect(await session.runLatest('demo-profile', signal => h.client.owner.readDemoProfile(signal))).toBeNull();
    expect(session.getState().status).toBe('SIGNED_OUT');
    const other = new OwnerSessionController(h.client);
    await other.initialize();
    expect((await other.runLatest('demo-profile', signal => h.client.owner.readDemoProfile(signal)))?.profile.version).toBe(0);
  });
});
