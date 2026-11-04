import {afterEach,describe,expect,it,vi} from 'vitest';
import {createPostgresOwnerStudyPlanServices} from '../../apps/api/src/modules/academics/owner-study-plan-services-postgres.js';
import {PostgresOwnerStudyPlanSnapshotLoader} from '../../apps/api/src/modules/academics/owner-study-plan-postgres.js';
import {createPostgresPlatformServices} from '../../apps/api/src/platform-postgres.js';
import type {ApprovedOwnerStudyPlanSnapshot} from '../../apps/api/src/modules/academics/owner-study-plan-source.js';
import type {OwnerStudyPlanCheckResponse} from '@hufs-one/contracts';

const at='2026-11-04T00:00:00.000Z',actorId='SYN-OWNER',term='2027-1';
const input={actorId,term,now:at};
afterEach(()=>vi.restoreAllMocks());
function fixture(){
  const snapshot:ApprovedOwnerStudyPlanSnapshot={actorId,term,asOf:at,receipt:'SYN-SNAPSHOT',
    transcript:{version:'SYN-T',state:'APPROVED',attempts:[]},
    plan:{version:'SYN-PLAN',items:['SYN-A','SYN-B'].map(courseId=>({kind:'STUDY_PLAN',dataMode:'SYNTHETIC',state:'DRAFT',courseId,targetTerm:term,planned:true}))},
    catalog:{version:'SYN-C',courseCreditUnits:{'SYN-A':6,'SYN-B':6},sections:[]},
    rulePack:{version:'SYN-R',state:'APPROVED',termRules:{creditCapUnits:10,capEvidenceRefs:['SYN-CAP']}},
    approval:{rulePackState:'APPROVED',rulePackVersion:'SYN-R',officialEvidenceRefs:['SYN-CAP'],verifiedAt:at,
      sourceRightsVersion:'SYN-POLICY',consentVersion:'1',coreVersion:'SYN-CORE'},
    evidenceLinks:[{evidenceRef:'SYN-CAP',href:'https://synthetic.invalid/cap',verifiedAt:at}],
    visibility:{mode:'OWNER_VERIFIED',allowedCourseRefs:['SYN-A','SYN-B']}};
  const state={clock:at,consent:true,owner:true,current:true,policy:true,approved:true};
  const load=vi.spyOn(PostgresOwnerStudyPlanSnapshotLoader.prototype,'load').mockImplementation(async()=>structuredClone(snapshot));
  const revalidate=vi.spyOn(PostgresOwnerStudyPlanSnapshotLoader.prototype,'revalidateCurrent').mockImplementation(async()=>state.current);
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM api_self_consents')&&state.consent?[{version:1,choices_json:{personalStorage:true}}]:[]}));
  const pool={connect:vi.fn(async()=>({query,release:()=>{}}))};
  const authority={resolve:vi.fn(async()=>state.policy?{permissionRefs:new Set(['SYN-PERM']),policyVersion:'SYN-POLICY'}:null)};
  const ownerAuthority={mayRead:vi.fn(async({actorId:requested}:{actorId:string})=>state.owner&&requested===actorId)};
  const approval={isApproved:vi.fn(async()=>state.approved)};
  const options={pool,authority,ownerAuthority,approval,now:()=>state.clock};
  const services=createPostgresOwnerStudyPlanServices(options);
  const inspect=async()=>{const result=await services.source.inspect(input);return {...result,check:result.check as OwnerStudyPlanCheckResponse};};
  const rightsInput=(check:OwnerStudyPlanCheckResponse)=>({actorId,term,asOf:check.asOf,sourceReceipt:snapshot.receipt,now:at,
    planVersion:check.versions.plan!,disclosureMode:check.disclosure.mode,courseRefs:check.disclosure.visibleCourseRefs,evidenceLinks:check.evidenceLinks,
    evidenceRefs:[...new Set([...check.evidenceLinks.map(l=>l.evidenceRef),...check.planIssues.flatMap(i=>i.evidenceRefs),...check.approval!.officialEvidenceRefs])].sort()});
  const gateInput=(check:OwnerStudyPlanCheckResponse)=>({actorId,term,asOf:check.asOf,sourceReceipt:snapshot.receipt,now:at,
    ...check.approval!,approval:check.approval!,evidenceLinks:check.evidenceLinks});
  return {snapshot,state,load,revalidate,query,pool,authority,ownerAuthority,approval,options,services,inspect,rightsInput,gateInput};
}

describe('PostgreSQL owner study-plan service authority',()=>{
  it('constructs without IO and denies independent owner permission before SQL/source reads',async()=>{
    const pool={connect:vi.fn()},authority={resolve:vi.fn()},approval={isApproved:vi.fn()};
    const ownerAuthority={mayRead:vi.fn(async()=>false)};
    const services=createPostgresOwnerStudyPlanServices({pool,authority,ownerAuthority,approval,now:()=> '2026-11-04T00:00:00.000Z'});
    expect(pool.connect).not.toHaveBeenCalled();expect(authority.resolve).not.toHaveBeenCalled();
    const input={actorId:'SYN-OWNER',term:'2027-1',now:'2026-11-04T00:00:00.000Z'};
    expect(await services.rights.mayInspect(input)).toBe(false);
    await expect(services.source.inspect(input)).rejects.toThrow();
    expect(pool.connect).not.toHaveBeenCalled();expect(authority.resolve).not.toHaveBeenCalled();
    expect(approval.isApproved).not.toHaveBeenCalled();
  });
  it('binds the actual core projection to repeated source/rights/independent approval checks',async()=>{
    const f=fixture(),result=await f.inspect();
    expect(result.check).toMatchObject({termLoadCreditUnits:12,creditCapUnits:10,state:'NEEDS_REVIEW'});
    expect(await f.services.source.revalidate({actorId,receipt:result.receipt,now:at})).toBe(true);
    const right=await f.services.rights.authorize(f.rightsInput(result.check));expect(right.allowed).toBe(true);
    expect(await f.services.rights.revalidate({actorId,sourceReceipt:result.receipt,rightsReceipt:right.rightsReceipt,now:at})).toBe(true);
    expect(await f.services.approvalGate.isApproved(f.gateInput(result.check))).toBe(true);
    expect(await f.services.approvalGate.isApproved(f.gateInput(result.check))).toBe(true);
    expect(f.approval.isApproved).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result.check)).not.toMatch(/actorId|SYN-SNAPSHOT/);
  });
  it('rejects forged disclosure refs, exact href/time, plan/term and cross-owner receipts',async()=>{
    const f=fixture(),result=await f.inspect(),base=f.rightsInput(result.check);
    for(const altered of [{...base,courseRefs:[...base.courseRefs,'SYN-PRIVATE']},{...base,evidenceRefs:[]},
      {...base,evidenceLinks:[{...base.evidenceLinks[0]!,href:'https://synthetic.invalid/other'}]},
      {...base,evidenceLinks:[{...base.evidenceLinks[0]!,verifiedAt:'2026-11-03T00:00:00.000Z'}]},
      {...base,planVersion:'OLD'},{...base,term:'2028-1'},{...base,actorId:'SYN-OTHER'}])
      expect((await f.services.rights.authorize(altered)).allowed).toBe(false);
    const gate=f.gateInput(result.check);
    expect(await f.services.approvalGate.isApproved({...gate,coreVersion:'FORGED'})).toBe(false);
    expect(f.approval.isApproved).not.toHaveBeenCalled();
  });
  it('rechecks source and owner authority after asynchronous independent approval',async()=>{
    const f=fixture(),result=await f.inspect();
    f.approval.isApproved.mockImplementation(async()=>{f.state.current=false;return true;});
    expect(await f.services.approvalGate.isApproved(f.gateInput(result.check))).toBe(false);
    f.state.current=true;f.approval.isApproved.mockImplementation(async()=>{f.state.owner=false;return true;});
    expect(await f.services.approvalGate.isApproved(f.gateInput(result.check))).toBe(false);
  });
  it('keeps an incomplete earned-term input in NEEDS_REVIEW instead of promoting it to READY',async()=>{
    const f=fixture();f.snapshot.catalog.sections=['SYN-A','SYN-B'].map((canonicalCourseId,i)=>({canonicalCourseId,sectionId:canonicalCourseId+'-01',term,
      meetings:[{day:'MON',startMinute:540+i*60,endMinute:600+i*60}],evidenceRefs:['SYN-CAP'],verifiedAt:at}));
    f.snapshot.transcript.attempts=[{attemptToken:'SYN-PRIVATE-ATTEMPT',canonicalCourseId:'SYN-EARNED',creditUnits:6,ledger:'EARNED',areaIds:[],recognition:'RECOGNIZED'}];
    expect((await f.inspect()).check.state).toBe('NEEDS_REVIEW');
  });
  it('denies withdrawn storage/source rights, expiry and unsupported sharing disclosures',async()=>{
    const f=fixture(),result=await f.inspect();
    for(const key of ['consent','policy','owner','current'] as const){
      f.state[key]=false;expect(await f.services.source.revalidate({actorId,receipt:result.receipt,now:at})).toBe(false);f.state[key]=true;
    }
    f.state.clock='2026-11-04T00:00:31.000Z';const before=f.pool.connect.mock.calls.length;
    expect(await f.services.source.revalidate({actorId,receipt:result.receipt,now:f.state.clock})).toBe(false);
    expect(f.pool.connect.mock.calls.length).toBe(before);
    f.state.clock=at;f.snapshot.visibility={mode:'GRANT_SCOPED',allowedCourseRefs:['SYN-A','SYN-B'],grantVersion:'SYN-GRANT'};
    await expect(f.inspect()).rejects.toThrow('rights not bound');
  });
  it('wires only explicit platform configuration and rejects ambiguous old/new service ports',()=>{
    const f=fixture(),config={pools:{projections:f.pool,calendar:f.pool,personal:f.pool,evidence:f.pool},evidenceRights:{resolveFor:async()=>null}};
    expect(createPostgresPlatformServices(config).studyPlanCheck).toBeUndefined();
    expect(createPostgresPlatformServices({...config,ownerStudyPlan:f.options}).studyPlanCheck).toBeDefined();
    expect(()=>createPostgresPlatformServices({...config,ownerStudyPlan:f.options,
      studyPlanCheck:{pool:f.pool,authority:f.authority,rights:f.services.rights,approvalGate:f.services.approvalGate}})).toThrow('Ambiguous');
  });
});
