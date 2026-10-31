import {afterEach,describe,expect,it,vi} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {PersonalStateDenied,PersonalStateConflict,PostgresPersonalStateStore} from '../../apps/api/src/db/personal-state-postgres.js';
import type {ApiOptions} from '../../apps/api/src/types.js';
import type {TrustedPersonalScope,PersonalRecordValue,StoredPersonalRecord} from '../../apps/api/src/db/personal-state-postgres.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={actorId:'SYN-OWNER',role:'BETA' as const,betaAllowed:true,
  sessionIdHash:'H'.repeat(32),sessionExpiresAt:'2026-11-05T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z',csrfToken:'C'.repeat(32)};
const grant=SharingGrantSchema.parse({grantId:'G-PERSONAL',actorId:actor.actorId,demoSubjectId:'S01',
  allowedSections:['FEED','NOTICES','ACADEMICS','EXPERIENCE'],version:'v1',
  displayNameAllowed:false,recordingAllowed:false,expiresAt:actor.sessionExpiresAt});
const headers={cookie:'owner',origin:ORIGIN,'x-csrf-token':actor.csrfToken};
const value={kind:'EXPERIENCE' as const,dataMode:'SYNTHETIC' as const,title:'합성 경험',summary:'합성 설명'};
const opened:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(opened.splice(0).map(app=>app.close()));});
function record(scope:TrustedPersonalScope,itemId:string,itemValue:PersonalRecordValue=value,version=1):StoredPersonalRecord{
  return {...scope,itemId,kind:itemValue.kind,value:itemValue,version,updatedAt:NOW};
}
function port(){
  return {
    create:vi.fn(async({scope,itemId,value:input}:{scope:TrustedPersonalScope;itemId:string;value:unknown})=>record(scope,itemId,input as PersonalRecordValue)),
    read:vi.fn(async({scope,itemId}:{scope:TrustedPersonalScope;itemId:string})=>record(scope,itemId)),
    list:vi.fn(async({scope}:{scope:TrustedPersonalScope})=>[record(scope,'item1')]),
    update:vi.fn(async({scope,itemId,value:input,expectedVersion}:{scope:TrustedPersonalScope;itemId:string;value:unknown;expectedVersion:number})=>record(scope,itemId,input as PersonalRecordValue,expectedVersion+1)),
    delete:vi.fn(async({expectedVersion}:{expectedVersion:number})=>({version:expectedVersion+1})),
  };
}
async function harness(store:ApiOptions['personalState']){
  const repository=new MemoryApiRepository({
    profiles:profiles.profiles.map(x=>DemoProfileOptionSchema.parse(x)),
    projections:[DemoSnapshotSchema.parse(snapshot)],grants:[grant],
  });
  const app=createApi({repository,allowedOrigin:ORIGIN,now:()=>NOW,
    ...(store?{personalState:store}:{}),
    reviewerAccess:{saveIssued:async()=>{},redeem:async()=>null,readActive:async()=>null,revoke:async()=>false},
    verifySession:async req=>req.headers.cookie==='owner'?actor:
      req.headers.cookie==='other'?{...actor,actorId:'SYN-OTHER',sessionIdHash:'J'.repeat(32)}:
      req.headers.cookie==='reviewer'?{actorId:'SYN-REVIEWER',role:'REVIEWER',
        sessionIdHash:'R'.repeat(32),csrfToken:actor.csrfToken,
        sessionExpiresAt:actor.sessionExpiresAt,identityProofExpiresAt:actor.sessionExpiresAt,
        verifiedEmail:'synthetic@example.invalid'}:null});
  opened.push(app);
  const res=await app.inject({method:'POST',url:'/api/demo/contexts',headers,
    payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN'}});
  expect(res.statusCode).toBe(201);
  return {app,repository,url:`/api/demo/contexts/${res.json().contextId}/personal`};
}
describe('authenticated actor-owned personal HTTP state',()=>{
  it('creates, lists, reads, updates and deletes via trusted actor/context/grant scope',async()=>{
    const store=port(),{app,url}=await harness(store);
    const created=await app.inject({method:'POST',url,headers,payload:{itemId:'item1',value}});
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({itemId:'item1',version:1,value});
    expect(created.json()).not.toHaveProperty('actorId');
    const listed=await app.inject({url:url+'?kind=EXPERIENCE&limit=10',headers});
    expect(listed.statusCode).toBe(200);expect(listed.json().items).toHaveLength(1);
    expect((await app.inject({url:url+'/item1?kind=EXPERIENCE',headers})).statusCode).toBe(200);
    const changed=await app.inject({method:'PUT',url:url+'/item1',headers,payload:{expectedVersion:1,value}});
    expect(changed.statusCode).toBe(200);expect(changed.json().version).toBe(2);
    expect((await app.inject({method:'DELETE',url:url+'/item1',headers,payload:{kind:'EXPERIENCE',expectedVersion:2}})).json()).toEqual({version:3});
    for(const operation of Object.values(store))expect(operation.mock.calls[0]?.[0]).toMatchObject({
      scope:{actorId:actor.actorId,subjectId:'S01',grantVersion:'v1'},
    });
  });
  it('denies anonymous, foreign sessions, absent CSRF and wrong Origin without a store call',async()=>{
    const store=port(),{app,url}=await harness(store);
    expect((await app.inject({url:url+'/item1?kind=EXPERIENCE'})).statusCode).toBe(401);
    expect((await app.inject({url:url+'/item1?kind=EXPERIENCE',headers:{cookie:'other'}})).statusCode).toBe(403);
    for(const invalid of [{cookie:'owner',origin:ORIGIN},{...headers,origin:'https://other.invalid'}]){
      expect((await app.inject({method:'POST',url,headers:invalid,payload:{itemId:'item1',value}})).statusCode).toBe(403);
    }
    for(const operation of Object.values(store))expect(operation).not.toHaveBeenCalled();
  });
  it('denies stale contexts and revoked scopes before accessing personal data',async()=>{
    const store=port(),{app,url,repository}=await harness(store);
    repository.setGrant({...grant,version:'v2'});
    expect((await app.inject({url:url+'/item1?kind=EXPERIENCE',headers})).statusCode).toBe(409);
    repository.setGrant({...grant,allowedSections:['FEED','NOTICES','ACADEMICS']});
    expect((await app.inject({url:url+'/item1?kind=EXPERIENCE',headers})).statusCode).toBe(403);
    repository.revokeGrant(actor.actorId,'S01',NOW);
    expect((await app.inject({method:'POST',url,headers,payload:{itemId:'item1',value}})).statusCode).toBe(403);
    expect(store.read).not.toHaveBeenCalled();expect(store.create).not.toHaveBeenCalled();
  });
  it('maps missing adapters to 503, store denial to 403 and optimistic conflicts to 409',async()=>{
    const noAdapter=await harness(undefined);
    expect((await noAdapter.app.inject({url:noAdapter.url+'?kind=EXPERIENCE',headers})).statusCode).toBe(503);
    const store=port(),{app,url}=await harness(store);
    store.create.mockRejectedValueOnce(new PersonalStateDenied());
    expect((await app.inject({method:'POST',url,headers,payload:{itemId:'item1',value}})).statusCode).toBe(403);
    store.update.mockRejectedValueOnce(new PersonalStateConflict());
    expect((await app.inject({method:'PUT',url:url+'/item1',headers,payload:{expectedVersion:1,value}})).statusCode).toBe(409);
    store.read.mockRejectedValueOnce(new Error('private database detail'));
    const failed=await app.inject({url:url+'/item1?kind=EXPERIENCE',headers});
    expect(failed.statusCode).toBe(503);expect(failed.body).not.toContain('database detail');
  });
  it('rejects actor injection, invalid versions and reversed experience dates as 422',async()=>{
    const store=port(),{app,url}=await harness(store);
    for(const payload of [{itemId:'item1',value,actorId:'SYN-OTHER'},
      {itemId:'item1',value:{...value,actorId:'SYN-OTHER'}},
      {itemId:'item1',value:{...value,startedOn:'2026-11-01',endedOn:'2026-10-01'}}]){
      expect((await app.inject({method:'POST',url,headers,payload})).statusCode).toBe(422);
    }
    expect((await app.inject({method:'PUT',url:url+'/item1',headers,payload:{expectedVersion:0,value}})).statusCode).toBe(422);
    expect(store.create).not.toHaveBeenCalled();expect(store.update).not.toHaveBeenCalled();
  });
  it('refuses adapter output belonging to another actor',async()=>{
    const store=port(),{app,url}=await harness(store);
    store.read.mockResolvedValueOnce(record({actorId:'SYN-OTHER',subjectId:'S01',grantVersion:'v1'},'item1'));
    expect((await app.inject({url:url+'/item1?kind=EXPERIENCE',headers})).statusCode).toBe(403);
  });
  it('keeps REVIEWER outside personal storage for reads and mutations',async()=>{
    const store=port(),{app,url}=await harness(store);
    expect((await app.inject({url:url+'/item1?kind=EXPERIENCE',headers:{cookie:'reviewer'}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url,headers:{...headers,cookie:'reviewer'},payload:{itemId:'item1',value}})).statusCode).toBe(403);
    for(const operation of Object.values(store))expect(operation).not.toHaveBeenCalled();
  });
  it('returns an explicit missing item without inventing data',async()=>{
    const store=port(),{app,url}=await harness(store);
    store.read.mockResolvedValueOnce(null as unknown as StoredPersonalRecord);
    const response=await app.inject({url:url+'/item1?kind=EXPERIENCE',headers});
    expect(response.statusCode).toBe(200);expect(response.json()).toEqual({item:null});
  });
  it('preserves independent default-deny consent and synthetic provenance checks in the real store',async()=>{
    const pool={connect:async()=>({query:async(sql:string)=>({rows:sql.includes('api_lock_authorized_personal_grant')?[{allowed:true}]:[]}),release:()=>{}})};
    const {app,url}=await harness(new PostgresPersonalStateStore(pool));
    for(const dataMode of ['SYNTHETIC','OWNER_CONSENTED']){
      expect((await app.inject({method:'POST',url,headers,payload:{itemId:'item1',value:{...value,dataMode}}})).statusCode).toBe(403);
    }
  });
});
