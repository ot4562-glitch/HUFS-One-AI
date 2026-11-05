import {afterEach,describe,expect,it} from 'vitest';
import {DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {ScopedApiRepository} from '../../apps/api/src/scoped-repository.js';
import {PostgresApiProjectionRepository} from '../../apps/api/src/repository-postgres.js';
import type {CalendarInputSource} from '../../apps/api/src/modules/calendar.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import source from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={actorId:'SYN-SCOPED-OWNER',role:'BETA' as const,betaAllowed:true,
  sessionIdHash:'S'.repeat(32),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z'};
const opened:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(opened.splice(0).map(app=>app.close()));});
const academic=(asOf:string)=>({state:'READY',rulePackVersion:'SYN-RULE-1',asOf,
  earnedCreditUnits:4,inProgressCreditUnits:2,plannedCreditUnits:0,deficits:[],
  caveats:['Synthetic academic summary']});
const forecast=(asOf:string)=>({status:'PARTIAL',asOf,items:[]});
const variants=[
  {name:'not shared',academics:{state:'NOT_SHARED'},forecast:{state:'NOT_SHARED'}},
  {name:'valid',academics:academic(source.asOf),forecast:forecast(source.asOf)},
  {name:'older',academics:academic('2026-10-29T00:00:00.000Z'),forecast:forecast('2026-10-29T00:00:00.000Z')},
  {name:'future',academics:academic('2026-11-02T00:00:00.000Z'),forecast:forecast('2026-11-02T00:00:00.000Z')},
  {name:'malformed',academics:null,forecast:{unknown:'SYN-HIDDEN-INVALID'}},
];
type Hidden={academics:unknown;forecast:unknown};
type Target='base'|'approved';

// Real scoped repository + PostgreSQL projection adapter + Fastify HTTP.
// Only SQL transport and the independently trusted calendar input source are
// synthetic ports; no student's records, external provider or live DB is used.
async function harness(shared:boolean|'ACADEMICS'|'FORECAST'=false){
  let grant=SharingGrantSchema.parse({grantId:'SYN-G',actorId:actor.actorId,demoSubjectId:'S01',
    version:'G1',expiresAt:actor.sessionExpiresAt,
    allowedSections:shared===true?['FEED','NOTICES','ACADEMICS','FORECAST']
      :shared?['FEED','NOTICES',shared]:['FEED','NOTICES'],
    displayNameAllowed:false,recordingAllowed:false});
  let base:Record<string,unknown>=structuredClone(source),approved:Record<string,unknown>=structuredClone(source);
  let validReceipt=true,onRevalidate=()=>{};
  const queries:string[]=[];
  const pool:ReviewerSqlPool={connect:async()=>({
    query:async sql=>{
      queries.push(sql);
      if(sql.includes('FROM api_sharing_grants'))return {rows:grant.revokedAt?[]:[{
        grant_id:grant.grantId,actor_id:grant.actorId,subject_id:grant.demoSubjectId,
        version:grant.version,allowed_sections:grant.allowedSections,expires_at:grant.expiresAt,
        revoked_at:null,display_name_allowed:false,recording_allowed:false,
      }]};
      if(sql.includes('FROM api_demo_profile_projections'))return {rows:
        (['S01','S02','S03','S04','S05'] as const).map(id=>({subject_id:id,
          profile_json:{demoSubjectId:id,displayLabel:id,dataMode:'SYNTHETIC',readiness:'READY',
            allowedSections:grant.allowedSections}}))};
      if(sql.includes('FROM api_demo_snapshot_projections'))return {rows:[{
        subject_id:'S01',snapshot_json:structuredClone(base),
        snapshot_metadata:{demoSubjectId:base.demoSubjectId,datasetMode:base.datasetMode,
          asOf:base.asOf,versions:base.versions},
      }]};
      throw Error('Unexpected synthetic query');
    },release:()=>{},
  })};
  const calendar:CalendarInputSource={
    readAuthorizedInputs:async input=>({
      actorId:actor.actorId,context:input.context,grant:structuredClone(grant),asOf:source.asOf,
      datasetMode:'SYNTHETIC',sourceVersion:'SYN-SOURCE-1',authorizationToken:'SYN-RECEIPT',
      approvedSnapshot:structuredClone(approved) as ReturnType<typeof DemoSnapshotSchema.parse>,
      scopeKey:[...grant.allowedSections].sort().join(','),provenance:{},
      profile:{interestTopics:[],desiredJobTopics:[],approvedExperienceTopics:[],
        approvedLanguageCodes:[],officialMajorTopics:[],facts:{}},
      noticeStudent:{openRequirementIds:[],courseIds:[],interestTopics:[]},
      opportunities:[],notices:[],revisions:[],authorizedRevisionIds:[],
    }),
    revalidateAuthorization:async()=>{onRevalidate();return validReceipt;},
  };
  const repository=new ScopedApiRepository(new PostgresApiProjectionRepository(pool,()=>NOW),calendar,()=>NOW);
  const app=createApi({allowedOrigin:ORIGIN,now:()=>NOW,verifySession:async()=>actor,repository,calendarSource:calendar});
  opened.push(app);
  const create=()=>app.inject({method:'POST',url:'/api/demo/contexts',
    headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN'}});
  const created=await create();expect(created.statusCode).toBe(201);
  return {app,create,queries,prefix:'/api/demo/contexts/'+created.json().contextId,
    set:(target:Target,value:Hidden)=>{
      if(target==='base')base={...base,academics:value.academics,forecast:value.forecast};
      else approved={...approved,academics:value.academics,forecast:value.forecast};
    },
    setBaseMetadata:(change:Record<string,unknown>)=>{base={...base,...change};},
    invalidate:()=>{validReceipt=false;},
    revoke:()=>{grant={...grant,revokedAt:NOW};},
    changeGrantDuringReply:()=>{onRevalidate=()=>{grant={...grant,version:'G2',
      allowedSections:['FEED','NOTICES','ACADEMICS','FORECAST']};};},
  };
}

describe('#229 hidden academic/forecast noninterference through real scoped HTTP composition',()=>{
  for(const target of ['base','approved'] as const)for(const hidden of variants){
    it(`keeps ${target} ${hidden.name} data invisible during reads and context creation`,async()=>{
      const h=await harness(),before=await h.app.inject({url:h.prefix+'/snapshot'});
      expect(before.statusCode).toBe(200);
      h.set(target,hidden);
      const after=await h.app.inject({url:h.prefix+'/snapshot'});
      expect(after.statusCode).toBe(200);
      expect(after.json()).toEqual(before.json());
      expect(after.json().academics).toEqual({state:'NOT_SHARED'});
      expect(after.json().forecast).toEqual({state:'NOT_SHARED'});
      expect((await h.app.inject({url:h.prefix+'/notices'})).statusCode).toBe(200);
      expect((await h.create()).statusCode).toBe(201);
    });
  }
  it.each(['older','future','malformed'])('still rejects shared %s summaries',async name=>{
    const h=await harness(true),hidden=variants.find(value=>value.name===name)!;
    h.set('approved',hidden);
    const result=await h.app.inject({url:h.prefix+'/snapshot'});
    expect(result.statusCode).toBe(name==='malformed'?422:403);
    expect((await h.create()).statusCode).toBe(name==='malformed'?422:403);
  });
  it('requires exact BETA summary asOf even when an older synthetic summary is well formed',async()=>{
    const h=await harness(true);
    h.set('approved',{academics:academic(source.asOf),forecast:forecast(source.asOf)});
    expect((await h.app.inject({url:h.prefix+'/snapshot'})).statusCode).toBe(200);
    h.set('approved',variants.find(value=>value.name==='older')!);
    expect((await h.app.inject({url:h.prefix+'/snapshot'})).statusCode).toBe(403);
  });
  it('denies direct hidden sections and a revoked grant before reading projection rows',async()=>{
    const h=await harness(),start=h.queries.length;
    for(const path of ['/graduation','/outlook'])
      expect((await h.app.inject({url:h.prefix+path})).statusCode).toBe(403);
    expect(h.queries.slice(start).some(sql=>sql.includes('FROM api_demo_snapshot_projections'))).toBe(false);
    h.revoke();
    expect((await h.app.inject({url:h.prefix+'/snapshot'})).statusCode).toBe(403);
  });
  it('does not return a scoped snapshot after its source receipt is invalidated',async()=>{
    const h=await harness();h.invalidate();
    expect((await h.app.inject({url:h.prefix+'/snapshot'})).statusCode).toBe(403);
  });
  it('rejects grant promotion/version changes during response revalidation',async()=>{
    const h=await harness();h.changeGrantDuringReply();
    expect((await h.app.inject({url:h.prefix+'/snapshot'})).statusCode).toBe(409);
  });

  it.each(['ACADEMICS','FORECAST'] as const)('validates %s while masking the other hidden section',async section=>{
    const h=await harness(section);
    h.set('approved',section==='ACADEMICS'
      ?{academics:academic(source.asOf),forecast:null}
      :{academics:null,forecast:forecast(source.asOf)});
    const result=await h.app.inject({url:h.prefix+'/snapshot'});
    expect(result.statusCode).toBe(200);
    expect(result.json().academics).toEqual(section==='ACADEMICS'?academic(source.asOf):{state:'NOT_SHARED'});
    expect(result.json().forecast).toEqual(section==='FORECAST'?forecast(source.asOf):{state:'NOT_SHARED'});
  });
  it('uses only receipted shared summaries, even if unused base summaries are malformed',async()=>{
    const h=await harness(true);
    h.set('base',{academics:null,forecast:null});
    h.set('approved',{academics:academic(source.asOf),forecast:forecast(source.asOf)});
    const result=await h.app.inject({url:h.prefix+'/snapshot'});
    expect(result.statusCode).toBe(200);
    expect(result.json().academics).toEqual(academic(source.asOf));
  });
  it.each([
    ['subject',{demoSubjectId:'S02'},503],
    ['future asOf',{asOf:'2026-11-02T00:00:00.000Z'},503],
    ['dataset',{versions:{...source.versions,dataset:'SYN-OTHER'}},403],
    ['projection',{versions:{...source.versions,projection:'SYN-OTHER'}},403],
    ['malformed version',{versions:null},422],
  ] as const)('retains strict base %s metadata checks',async(_name,change,status)=>{
    const h=await harness();h.setBaseMetadata(change);
    expect((await h.app.inject({url:h.prefix+'/snapshot'})).statusCode).toBe(status);
  });
});
