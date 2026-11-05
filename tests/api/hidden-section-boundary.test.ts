import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import type {ApiRepository} from '../../apps/api/src/types.js';
import {createApi} from '../../apps/api/src/server.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import source from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={actorId:'SYN-ACTOR-01',role:'BETA' as const,betaAllowed:true,
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z'};
const opened:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(opened.splice(0).map(app=>app.close()));});
const academic=(asOf:string)=>({state:'READY',rulePackVersion:'SYN-RULE-1',asOf,
  earnedCreditUnits:4,inProgressCreditUnits:2,plannedCreditUnits:0,
  deficits:[{requirementId:'SYN-REQ-1',state:'NEEDS_REVIEW',evidenceRefs:[]}],caveats:['Synthetic only']});
const forecast=(asOf:string)=>({status:'PARTIAL',asOf,items:[]});
async function harness(shared=false,initial?:{academics:unknown;forecast:unknown}){
  const granted=SharingGrantSchema.parse({grantId:'G-SYN',actorId:actor.actorId,demoSubjectId:'S01',
    version:'G1',expiresAt:actor.sessionExpiresAt,
    allowedSections:shared?['FEED','NOTICES','ACADEMICS','FORECAST']:['FEED','NOTICES'],
    displayNameAllowed:false,recordingAllowed:false});
  let payload:unknown={...source,...initial},revoked=false;
  // This is an explicitly scoped synthetic adapter, not a production source or
  // the memory adapter's unscoped precomputed-derived-input shortcut.
  const repository:ApiRepository={
    listProfiles:async()=>profiles.profiles.map(p=>DemoProfileOptionSchema.parse(p)),
    readGrant:async(id,subject)=>!revoked&&id===actor.actorId&&subject==='S01'?granted:null,
    readSnapshot:async()=>{throw new Error('Subject-only read must never run');},
    readSafePacket:async()=>null,
    readAuthorizedSnapshot:async input=>{
      if(revoked||input.actorId!==actor.actorId||input.subjectId!=='S01'||input.grantVersion!==granted.version
        ||input.requiredSections?.some(s=>!granted.allowedSections.includes(s)))return null;
      // Simulate a malformed or stale hidden section at an adapter boundary.
      // The visible feed/notices and metadata are known synthetic, scope-safe fixtures.
      return structuredClone(payload) as ReturnType<typeof DemoSnapshotSchema.parse>;
    },
  };
  const app=createApi({allowedOrigin:ORIGIN,repository,now:()=>NOW,verifySession:async()=>actor});
  opened.push(app);
  const create=()=>app.inject({method:'POST',url:'/api/demo/contexts',
    headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN'}});
  const created=await create();
  return {app,created,create,set:(value:unknown)=>{payload=value;},revoke:()=>{revoked=true;},
    prefix:'/api/demo/contexts/'+created.json().contextId};
}

describe('hidden section noninterference at BETA HTTP boundaries (#229)',()=>{
  it('returns identical scoped snapshots for hidden valid, stale, future and malformed values',async()=>{
    const h=await harness();expect(h.created.statusCode).toBe(201);
    let baseline:unknown;
    for(const hidden of [
      {academics:{state:'NOT_SHARED'},forecast:{state:'NOT_SHARED'}},
      {academics:academic(source.asOf),forecast:forecast(source.asOf)},
      {academics:academic('2026-10-29T00:00:00.000Z'),forecast:forecast('2026-10-29T00:00:00.000Z')},
      {academics:academic('2026-11-02T00:00:00.000Z'),forecast:forecast('2026-11-02T00:00:00.000Z')},
      {academics:null,forecast:{unknown:'SYN-PRIVATE-INVALID'}},
    ]){
      h.set({...source,...hidden});
      const response=await h.app.inject({url:h.prefix+'/snapshot'});
      expect(response.statusCode).toBe(200);
      expect(response.json().academics).toEqual({state:'NOT_SHARED'});
      expect(response.json().forecast).toEqual({state:'NOT_SHARED'});
      if(baseline===undefined)baseline=response.json();else expect(response.json()).toEqual(baseline);
      expect((await h.app.inject({url:h.prefix+'/notices'})).statusCode).toBe(200);
    }
  });
  it('also masks hidden malformed values before context-creation parsing',async()=>{
    const h=await harness(false,{academics:null,forecast:{unknown:'SYN-PRIVATE-INVALID'}});
    expect(h.created.statusCode).toBe(201);
  });
  it('preserves asOf rejection for shared sections and identity/version metadata',async()=>{
    const h=await harness(true);expect(h.created.statusCode).toBe(201);
    h.set({...source,academics:academic('2026-10-30T10:00:00.000Z')});
    expect((await h.app.inject({url:h.prefix+'/snapshot'})).statusCode).toBe(409);
    h.set({...source,demoSubjectId:'S02'});
    expect((await h.app.inject({url:h.prefix+'/snapshot'})).statusCode).toBe(409);
    h.set({...source,versions:{...source.versions,projection:'SYN-WRONG'}});
    expect((await h.app.inject({url:h.prefix+'/snapshot'})).statusCode).toBe(409);
  });
  it('does not authorize hidden direct endpoints or a revoked grant',async()=>{
    const h=await harness();expect(h.created.statusCode).toBe(201);
    for(const path of ['/graduation','/outlook'])
      expect((await h.app.inject({url:h.prefix+path})).statusCode).toBe(403);
    h.revoke();
    const response=await h.app.inject({url:h.prefix+'/snapshot'});
    expect(response.statusCode).toBe(403);
  });
});
