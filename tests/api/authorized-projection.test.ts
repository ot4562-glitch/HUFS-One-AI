import {afterEach,describe,expect,it,vi} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {createApi} from '../../apps/api/src/server.js';
import type {ApiRepository} from '../../apps/api/src/types.js';
import fixtureProfiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import fixtureSnapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={
  actorId:'SYN-ACTOR-01',role:'BETA' as const,betaAllowed:true,
  sessionIdHash:'H'.repeat(32),sessionExpiresAt:'2026-11-05T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z',csrfToken:'C'.repeat(32),
};
const grant=SharingGrantSchema.parse({
  grantId:'G-ATOMIC',actorId:actor.actorId,demoSubjectId:'S01',
  allowedSections:['FEED','NOTICES','ACADEMICS','EXPERIENCE'],displayNameAllowed:false,recordingAllowed:false,
  version:'v1',expiresAt:'2026-11-05T00:00:00.000Z',
});
const post={method:'POST' as const,url:'/api/demo/contexts',
  headers:{origin:ORIGIN,cookie:'verified','x-csrf-token':actor.csrfToken},
  payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN'},
};
const opened:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(opened.splice(0).map(x=>x.close()));});
function memory(mode:'SYNTHETIC'|'REAL_CONSENTED'|'MIXED'='SYNTHETIC'){
  return new MemoryApiRepository({
    profiles:fixtureProfiles.profiles.map(x=>DemoProfileOptionSchema.parse(x)),
    grants:[grant],projections:[DemoSnapshotSchema.parse({...fixtureSnapshot,datasetMode:mode})],
  });
}
function server(repo:ApiRepository){
  const app=createApi({repository:repo,allowedOrigin:ORIGIN,now:()=>NOW,
    verifySession:async(req)=>req.headers.cookie==='verified'?actor:null});
  opened.push(app);
  return app;
}

describe('BETA must use a single atomic actor/grant/projection read (#39)',()=>{
  it('never calls subject-only readSnapshot for a validated BETA context or snapshot',async()=>{
    const repo=memory();
    const unsafe=vi.spyOn(repo,'readSnapshot').mockRejectedValue(new Error('detached unsafe read'));
    const app=server(repo);
    const created=await app.inject(post);
    expect(created.statusCode).toBe(201);
    const id=created.json().contextId as string;
    const res=await app.inject({url:`/api/demo/contexts/${id}/snapshot`,
      headers:{cookie:'verified'}});
    expect(res.statusCode).toBe(200);
    expect(res.json().academics).toEqual(fixtureSnapshot.academics);
    expect(res.json().forecast).toEqual({state:'NOT_SHARED'});
    expect(unsafe).not.toHaveBeenCalled();
  });
  it('fails closed if the adapter only has readGrant then readSnapshot',async()=>{
    const repo=memory();
    const unsafe=vi.spyOn(repo,'readSnapshot');
    const legacy:ApiRepository={
      listProfiles:()=>repo.listProfiles(),
      readGrant:(actorId,subject)=>repo.readGrant(actorId,subject),
      readSnapshot:(subject)=>repo.readSnapshot(subject),
      readSafePacket:(actorId,task,ref)=>repo.readSafePacket(actorId,task,ref),
      // intentionally missing readAuthorizedSnapshot
    };
    const app=server(legacy);
    expect((await app.inject(post)).statusCode).toBe(403);
    expect(unsafe).not.toHaveBeenCalled();
  });
  it('invalidates the old context after revocation or grant version change',async()=>{
    const repo=memory(),app=server(repo);
    const created=await app.inject(post);
    expect(created.statusCode).toBe(201);
    const id=created.json().contextId as string;
    repo.setGrant({...grant,version:'v2'});
    expect((await app.inject({url:`/api/demo/contexts/${id}/snapshot`,
      headers:{cookie:'verified'}})).statusCode).toBe(409);
    repo.revokeGrant(actor.actorId,'S01',NOW);
    expect((await app.inject(post)).statusCode).toBe(403);
    expect(await repo.readAuthorizedSnapshot({
      actorId:actor.actorId,subjectId:'S01',grantVersion:'v2',now:NOW,
    })).toBeNull();
  });
  it('fails closed for precomputed derived feed/notices with partial ACADEMICS, EXPERIENCE or FEED sharing',async()=>{
    for(const removed of ['ACADEMICS','EXPERIENCE','FEED','NOTICES'] as const){
      const repo=memory();
      repo.setGrant({...grant,allowedSections:grant.allowedSections.filter(section=>section!==removed)});
      expect(await repo.readAuthorizedSnapshot({
        actorId:actor.actorId,subjectId:'S01',grantVersion:'v1',now:NOW,
        requiredSections:removed==='FEED'||removed==='NOTICES'?undefined:['FEED','NOTICES'],
      })).toBeNull();
      const app=server(repo);
      expect((await app.inject(post)).statusCode).toBe(403);
    }
  });
  it('synthetic memory adapter never releases real or mixed projections',async()=>{
    for(const mode of ['REAL_CONSENTED','MIXED'] as const){
      const repo=memory(mode),app=server(repo);
      expect((await app.inject(post)).statusCode).toBe(403);
      expect(await repo.readAuthorizedSnapshot({
        actorId:actor.actorId,subjectId:'S01',grantVersion:'v1',now:NOW,
      })).toBeNull();
    }
  });
  it('denies unshared sections, expired grant, foreign actor and stale projection asOf',async()=>{
    const repo=memory();
    expect(await repo.readAuthorizedSnapshot({
      actorId:actor.actorId,subjectId:'S01',grantVersion:'v1',
      requiredSections:['FORECAST'],now:NOW,
    })).toBeNull();
    expect(await repo.readAuthorizedSnapshot({
      actorId:'SYN-ACTOR-02',subjectId:'S01',grantVersion:'v1',now:NOW,
    })).toBeNull();
    expect(await repo.readAuthorizedSnapshot({
      actorId:actor.actorId,subjectId:'S01',grantVersion:'v1',
      now:'2026-11-05T00:00:00.000Z',
    })).toBeNull();
    repo.setProjection(DemoSnapshotSchema.parse({
      ...fixtureSnapshot,asOf:'2026-11-04T00:00:00.000Z',
      feed:{...fixtureSnapshot.feed,asOf:'2026-11-04T00:00:00.000Z'},
      notices:{...fixtureSnapshot.notices,asOf:'2026-11-04T00:00:00.000Z'},
    }));
    expect(await repo.readAuthorizedSnapshot({
      actorId:actor.actorId,subjectId:'S01',grantVersion:'v1',now:NOW,
    })).toBeNull();
  });
});
