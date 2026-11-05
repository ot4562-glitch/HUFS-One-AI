import {afterEach,describe,expect,it} from 'vitest';
import {isDeepStrictEqual} from 'node:util';
import type {AcademicDegreePathVNext,AcademicRulePackVNext,OwnerMajorWhatIfRequest} from '@hufs-one/contracts';
import {OwnerMajorWhatIfResponseSchema} from '@hufs-one/contracts';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {createPostgresPlatformServices} from '../../apps/api/src/platform-postgres.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
import type {TrustedOwnerMajorWhatIfRights,ApprovedMajorWhatIfGate} from '../../apps/api/src/modules/profiles/owner-major-what-if-http.js';
import type {
  ApprovedOwnerMajorWhatIfInput,OwnerMajorWhatIfSnapshot,TrustedOwnerMajorWhatIfLoader,
} from '../../apps/api/src/modules/academics/owner-major-what-if-source.js';

const NOW='2026-11-05T00:00:00.000Z',APPROVED='2026-11-01T00:00:00.000Z';
const ORIGIN='https://synthetic.invalid',URL='/api/academics/major-what-if';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const sourceRef={sourceId:'SYN-SOURCE',revisionId:'SYN-REVISION',permissionRef:'SYN-PERMISSION'};
type Scenario=OwnerMajorWhatIfRequest['scenario'];
type Bundle=ApprovedOwnerMajorWhatIfInput['current'];
type Enrollment=Bundle['enrollment'];
const single={primaryProgramId:'SYN-P'};
const double={...single,secondary:{role:'DOUBLE_MAJOR' as const,programId:'SYN-D'}};
const minor={...single,secondary:{role:'MINOR' as const,programId:'SYN-M'}};
const addMinor:Scenario={action:'ADD_MINOR',targetMajorId:'SYN-M'};

/** Invented source inventories and independent sign-offs; no student or school originals. */
function binding(programId:string,role:'PRIMARY_MAJOR'|'DOUBLE_MAJOR'|'MINOR',path:AcademicDegreePathVNext,primary:string){
  const primaryRole=role==='PRIMARY_MAJOR',area=programId+'-AREA';
  const requirement=(id:string)=>({id,semanticKey:id,sourceClauseIds:[id+'-CLAUSE'],exceptionClauseIds:[],evidenceRefs:[id+'-EV']});
  const requirements:AcademicRulePackVNext['requirements']=[
    ...(primaryRole?[{...requirement('SYN-TOTAL'),kind:'CREDIT_TOTAL' as const,
      requiredCreditUnits:path==='ADVANCED_SINGLE'?18:path==='DOUBLE_MAJOR'?24:30}]:[]),
    {...requirement(programId+'-REQ'),kind:'CATEGORY_MINIMUM',areaId:area,requiredCreditUnits:6},
  ];
  const clauseInventory=requirements.map(r=>({clauseId:r.id+'-CLAUSE',kind:'RULE' as const,sourceSpanRef:r.id+'-SPAN',
    coverage:{state:'LINKED' as const,requirementIds:[r.id]}}));
  const pack:AcademicRulePackVNext={version:programId+'-'+path+(primaryRole?'':'-'+primary)+'-V1',sourceDocumentVersion:programId+'-DOC-1',
    sourceDocumentUrl:ORIGIN+'/rules/'+programId,sourceDocumentSha256:'a'.repeat(64),
    sourcePublishedAt:APPROVED,effectiveFrom:APPROVED,
    scope:{campus:'SEOUL',primaryMajor:primary,...(!primaryRole?{secondaryMajor:programId}:{}),
      majorRole:role,admissionType:'REGULAR',curriculumVersion:'2024',degreePath:path,track:'MAIN',cohortFrom:2024,cohortTo:2024},
    state:'APPROVED',requirements,clauseInventory,
    validationReport:{checkedAt:APPROVED,sourceDocumentSha256:'a'.repeat(64),blockingIssues:[]},
    inventoryReviewedBy:'SYN-INVENTORY-REVIEWER',approvedBy:'SYN-APPROVER',
    independentlyCheckedBy:'SYN-INDEPENDENT-CHECKER',approvedAt:APPROVED};
  return {pack,trustedOriginal:{sourceDocumentSha256:'a'.repeat(64),
    clauses:clauseInventory.map(({clauseId,kind,sourceSpanRef})=>({clauseId,kind,sourceSpanRef}))},
    courseAreas:{[programId+'-COURSE']:[area]},source:sourceRef,catalogSource:sourceRef};
}
function bundle(enrollment:Enrollment,version:string):Bundle{
  const path:AcademicDegreePathVNext=!enrollment.secondary?'ADVANCED_SINGLE':
    enrollment.secondary.role==='DOUBLE_MAJOR'?'DOUBLE_MAJOR':'ADVANCED_PLUS_MINOR';
  const primary=binding(enrollment.primaryProgramId,'PRIMARY_MAJOR',path,enrollment.primaryProgramId);
  const secondary=enrollment.secondary?binding(enrollment.secondary.programId,enrollment.secondary.role,path,enrollment.primaryProgramId):undefined;
  return {version,degreePath:path,enrollment,primary,...(secondary?{secondary}:{}),
    constituentVersions:[primary.pack.version,...(secondary?[secondary.pack.version]:[])]};
}
function snapshot(current:Enrollment=single,hypothetical:Enrollment=minor,scenario:Scenario=addMinor):OwnerMajorWhatIfSnapshot&{input:ApprovedOwnerMajorWhatIfInput}{
  const before=bundle(current,'SYN-BUNDLE-C'),after=bundle(hypothetical,'SYN-BUNDLE-H');
  const refs=[...new Set([before.primary,before.secondary,after.primary,after.secondary].filter(b=>b!==undefined)
    .flatMap(b=>b.pack.requirements.flatMap(r=>r.evidenceRefs)))];
  return {actorId:actor.actorId,asOf:NOW,receipt:'SYN-WHATIF-SOURCE-RECEIPT',currentVersion:'SYN-OWNER-HEAD-1',scenario,
    input:{format:'OWNER_MAJOR_WHAT_IF_V1',
      profile:{version:'SYN-PROFILE-1',campus:'SEOUL',cohort:2024,admissionType:'REGULAR',curriculumVersion:'2024',track:'MAIN',source:sourceRef},
      transcript:{version:'SYN-TRANSCRIPT-1',state:'APPROVED',source:sourceRef,attempts:[
        {attemptToken:'P',canonicalCourseId:'SYN-P-COURSE',creditUnits:6,ledger:'EARNED',recognition:'RECOGNIZED',term:'2025-2'},
        {attemptToken:'D',canonicalCourseId:'SYN-D-COURSE',creditUnits:6,ledger:'EARNED',recognition:'RECOGNIZED',term:'2025-2'},
      ]},current:before,hypothetical:after,
      overlapPolicy:{version:'SYN-OVERLAP-POLICY-1',ruleVersions:[],verifiedAt:APPROVED},
      evidenceLinks:refs.map(evidenceRef=>({evidenceRef,href:ORIGIN+'/clauses/'+evidenceRef,verifiedAt:APPROVED})),
      approval:{verifiedAt:APPROVED,coreVersion:'hufs-major-what-if-2',cohortApplicabilityVersion:'SYN-PROFILE-1',
        currentRulePackVersion:'SYN-BUNDLE-C',hypotheticalRulePackVersion:'SYN-BUNDLE-H',
        overlapPolicyVersion:'SYN-OVERLAP-POLICY-1',transcriptProjectionVersion:'SYN-TRANSCRIPT-1',
        sourceRightsVersion:'SYN-RIGHTS-1',ownerConsentVersion:'SYN-CONSENT-1',officialEvidenceRefs:refs}}};
}
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});
function setup(value=snapshot(),options:{enabled?:boolean;approval?:boolean;rights?:boolean}={}){
  let identity:VerifiedActor|null=actor,mayRead=true,mayDisclose=true,current=true,rightsCurrent=true,approved=true,approvalCurrent=true;
  let loaded:OwnerMajorWhatIfSnapshot|null=value,reads=0;
  const hooks:{authorize?:()=>void;approve?:()=>void;load?:()=>void}={};
  const loader:TrustedOwnerMajorWhatIfLoader={
    load:async()=>{reads++;hooks.load?.();return loaded;},
    revalidate:async scope=>current&&scope.actorId===value.actorId&&scope.sourceReceipt===value.receipt
      &&scope.currentVersion===value.currentVersion&&scope.asOf===value.asOf&&isDeepStrictEqual(scope.scenario,value.scenario),
  };
  const rights:TrustedOwnerMajorWhatIfRights={
    mayInspect:async()=>mayRead,
    authorize:async input=>{hooks.authorize?.();return {
      allowed:mayDisclose&&input.evidenceLinks.every(link=>value.input.evidenceLinks.some(expected=>isDeepStrictEqual(link,expected))),
      rightsReceipt:'SYN-WHATIF-RIGHTS-RECEIPT'};},
    revalidate:async()=>rightsCurrent,
  };
  const approvalGate:ApprovedMajorWhatIfGate={
    authorize:async input=>{hooks.approve?.();return {
      allowed:approved&&isDeepStrictEqual(input.approval,value.input.approval)
        &&isDeepStrictEqual(input.evidenceLinks,value.input.evidenceLinks)
        &&input.currentVersion===value.currentVersion&&input.sourceReceipt===value.receipt,
      approvalReceipt:'SYN-WHATIF-APPROVAL-RECEIPT'};},
    revalidate:async()=>approvalCurrent,
  };
  const pool:ReviewerSqlPool={connect:async()=>{throw new Error('No database or raw-data access in synthetic adapter test');}};
  const services=createPostgresPlatformServices({pools:{projections:pool,calendar:pool,personal:pool,evidence:pool},
    evidenceRights:{resolveFor:async()=>{throw new Error('No temporal evidence read');}},now:()=>NOW,
    ...(options.enabled===false?{}:{majorWhatIf:{loader,...(options.rights===false?{}:{rights}),
      ...(options.approval===false?{}:{approvalGate})}}),
  } as Parameters<typeof createPostgresPlatformServices>[0]);
  const app=createIntegratedApi({...services,allowedOrigin:ORIGIN,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>identity,revokeSession:async()=>{}},now:()=>NOW});
  apps.push(app);
  return {services,hooks,loader,post:(payload:unknown={scenario:value.scenario})=>app.inject({method:'POST',url:URL,
    headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},payload:payload as Record<string,unknown>}),
    reads:()=>reads,denyRead:()=>{mayRead=false;},denyDisclosure:()=>{mayDisclose=false;},
    revokeSource:()=>{current=false;},revokeRights:()=>{rightsCurrent=false;},denyApproval:()=>{approved=false;},
    revokeApproval:()=>{approvalCurrent=false;},logout:()=>{identity=null;},unavailable:()=>{loaded=null;}};
}

describe('#231 approved owner RulePack to What-if core adapter',()=>{
  it('calculates actual approved packs through explicit platform wiring and the owner HTTP route',async()=>{
    const value=snapshot(),original=structuredClone(value),h=setup(value),response=await h.post();
    expect(response.statusCode).toBe(200);
    const result=OwnerMajorWhatIfResponseSchema.parse(response.json());
    expect(result).toMatchObject({state:'READY',caveat:'HYPOTHETICAL_NOT_OFFICIAL',
      current:{earnedCreditUnits:12,remainingCreditUnits:6,rulePackVersion:'SYN-BUNDLE-C'},
      hypothetical:{earnedCreditUnits:12,remainingCreditUnits:18,rulePackVersion:'SYN-BUNDLE-H'},
      delta:expect.arrayContaining([{requirementId:'SYN-M-REQ',change:'NEW_REQUIREMENT',evidenceRefs:['SYN-M-REQ-EV']}])});
    expect(value).toEqual(original);
    for(const privateField of ['attemptToken','canonicalCourseId','sourceDocumentSha256','sourceReceipt','SYN-OWNER-HEAD-1','SYN-OWNER'])
      expect(response.body).not.toContain(privateField);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each([
    ['ADD_DOUBLE_MAJOR',single,double,{action:'ADD_DOUBLE_MAJOR',targetMajorId:'SYN-D'},6,12],
    ['REMOVE_DOUBLE_MAJOR',double,single,{action:'REMOVE_DOUBLE_MAJOR'},12,6],
    ['REMOVE_MINOR',minor,single,{action:'REMOVE_MINOR'},18,6],
    ['CHANGE_DOUBLE_MAJOR',double,{...single,secondary:{role:'DOUBLE_MAJOR',programId:'SYN-D2'}},{action:'CHANGE_DOUBLE_MAJOR',targetMajorId:'SYN-D2'},12,12],
    ['CHANGE_MINOR',minor,{...single,secondary:{role:'MINOR',programId:'SYN-M2'}},{action:'CHANGE_MINOR',targetMajorId:'SYN-M2'},18,18],
    ['CHANGE_PRIMARY_MAJOR',single,{primaryProgramId:'SYN-Q'},{action:'CHANGE_PRIMARY_MAJOR',targetMajorId:'SYN-Q'},6,6],
  ] as const)('uses the canonical role/path packs for %s',async(_name,current,hypothetical,scenario,before,after)=>{
    const response=await setup(snapshot(current,hypothetical,scenario)).post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({state:'READY',
      current:{earnedCreditUnits:12,remainingCreditUnits:before},
      hypothetical:{earnedCreditUnits:12,remainingCreditUnits:after}});
  });

  type Value=ReturnType<typeof snapshot>;
  const invalid:Array<[string,(value:Value)=>void]>=[
    ['primary program',v=>{v.input.current.primary.pack.scope.primaryMajor='OTHER';}],
    ['secondary program',v=>{v.input.hypothetical.secondary!.pack.scope.secondaryMajor='OTHER';}],
    ['secondary role',v=>{v.input.hypothetical.secondary!.pack.scope.majorRole='DOUBLE_MAJOR';}],
    ['primary role',v=>{Object.assign(v.input.current.primary.pack.scope,{majorRole:'MINOR',secondaryMajor:'SYN-P'});}],
    ['scoped degree path',v=>{v.input.hypothetical.primary.pack.scope.degreePath='DOUBLE_MAJOR';}],
    ['bundle degree path',v=>{v.input.hypothetical.degreePath='DOUBLE_MAJOR';}],
    ['unsupported degree path',v=>{Object.assign(v.input.current,{degreePath:'MAJOR_DEEPENING_UNKNOWN'});}],
    ['legacy spelling at approved VNext boundary',v=>{Object.assign(v.input.current.primary.pack.scope,{degreePath:'MAJOR_DEEPENING'});}],
    ['campus',v=>{v.input.profile.campus='GLOBAL';}],
    ['cohort',v=>{v.input.profile.cohort=2025;}],
    ['admission',v=>{v.input.profile.admissionType='TRANSFER';}],
    ['curriculum',v=>{v.input.profile.curriculumVersion='2025';}],
    ['track',v=>{v.input.profile.track='OTHER';}],
    ['missing track',v=>{delete v.input.profile.track;}],
    ['original hash',v=>{v.input.current.primary.trustedOriginal.sourceDocumentSha256='b'.repeat(64);}],
    ['original clause',v=>{v.input.current.primary.trustedOriginal.clauses[0]!.sourceSpanRef='OTHER';}],
    ['missing original clause',v=>{v.input.current.primary.trustedOriginal.clauses.pop();}],
    ['missing secondary pack',v=>{delete v.input.hypothetical.secondary;}],
    ['extra secondary pack',v=>{v.input.current.secondary=v.input.hypothetical.secondary!;}],
    ['constituent order',v=>{v.input.hypothetical.constituentVersions.reverse();}],
    ['unattested constituent',v=>{v.input.current.constituentVersions[0]='OTHER';}],
    ['duplicate constituent',v=>{v.input.hypothetical.constituentVersions[1]=v.input.hypothetical.constituentVersions[0]!;}],
    ['bundle version reused for different contents',v=>{v.input.hypothetical.version=v.input.current.version;v.input.approval.hypotheticalRulePackVersion=v.input.current.version;}],
    ['proof current pack',v=>{v.input.approval.currentRulePackVersion='OTHER';}],
    ['proof hypothetical pack',v=>{v.input.approval.hypotheticalRulePackVersion='OTHER';}],
    ['proof cohort',v=>{v.input.approval.cohortApplicabilityVersion='OTHER';}],
    ['proof transcript',v=>{v.input.approval.transcriptProjectionVersion='OTHER';}],
    ['proof core',v=>{v.input.approval.coreVersion='OTHER';}],
    ['proof overlap',v=>{v.input.approval.overlapPolicyVersion='OTHER';}],
    ['overlap manifest',v=>{v.input.overlapPolicy.ruleVersions=['UNBOUND'];}],
    ['missing evidence',v=>{v.input.evidenceLinks.pop();}],
    ['unapproved transcript',v=>{Object.assign(v.input.transcript,{state:'DRAFT'});}],
    ['extra raw field',v=>{Object.assign(v.input,{rawStudentRecord:'SYNTHETIC-DO-NOT-RETURN'});}],
  ];
  it.each(invalid)('rejects a mismatched %s before emitting READY',async(_name,mutate)=>{
    const value=snapshot();mutate(value);
    const response=await setup(value).post();
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('PROVIDER_UNAVAILABLE');
    expect(response.body).not.toContain('SYNTHETIC-DO-NOT-RETURN');
  });

  it.each([
    ['past snapshot before approval',(v:Value)=>{v.asOf='2026-10-31T00:00:00.000Z';}],
    ['future snapshot',(v:Value)=>{v.asOf='2026-11-06T00:00:00.000Z';}],
    ['future effective start',(v:Value)=>{v.input.current.primary.pack.effectiveFrom='2026-11-06T00:00:00.000Z';}],
    ['expired hypothetical pack',(v:Value)=>{v.input.hypothetical.primary.pack.effectiveUntil=NOW;}],
    ['future pack approval',(v:Value)=>{v.input.current.primary.pack.approvedAt='2026-11-06T00:00:00.000Z';}],
    ['future proof',(v:Value)=>{v.input.approval.verifiedAt='2026-11-06T00:00:00.000Z';}],
    ['future overlap policy',(v:Value)=>{v.input.overlapPolicy.verifiedAt='2026-11-06T00:00:00.000Z';}],
    ['future evidence',(v:Value)=>{v.input.evidenceLinks[0]!.verifiedAt='2026-11-06T00:00:00.000Z';}],
  ])('refuses %s relative to the single trusted asOf',async(_name,mutate)=>{
    const value=snapshot();mutate(value);
    expect((await setup(value).post()).statusCode).toBe(503);
  });
  it('accepts a historical snapshot only when every approval was already effective',async()=>{
    const value=snapshot();value.asOf='2026-11-02T00:00:00.000Z';
    const response=await setup(value).post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({state:'READY',asOf:value.asOf,
      current:{asOf:value.asOf},hypothetical:{asOf:value.asOf}});
  });
  it('keeps independently unapproved current and hypothetical packs blocked',async()=>{
    for(const side of ['current','hypothetical'] as const){
      const value=snapshot(),pack=value.input[side].primary.pack;
      pack.state='DRAFT';delete pack.approvedBy;delete pack.independentlyCheckedBy;delete pack.approvedAt;
      const response=await setup(value).post();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({state:'BLOCKED_DEPENDENCY',
        blockers:[side==='current'?'CURRENT_RULEPACK_NOT_APPROVED':'RULEPACK_NOT_APPROVED'],
        caveat:'HYPOTHETICAL_NOT_OFFICIAL'});
    }
  });
  it('returns the core dependency blocker for an inapplicable scenario',async()=>{
    const value=snapshot(double,double,{action:'ADD_MINOR',targetMajorId:'SYN-M'});
    const response=await setup(value).post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({state:'BLOCKED_DEPENDENCY',blockers:['TARGET_PROGRAM_UNAVAILABLE']});
  });
  it('rejects a scenario that selects a different approved bundle than the attested manifest',async()=>{
    const value=snapshot(single,double,{action:'ADD_MINOR',targetMajorId:'SYN-M'});
    const response=await setup(value).post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({state:'BLOCKED_DEPENDENCY',blockers:['TARGET_PROGRAM_UNAVAILABLE']});
  });

  it.each([
    ['foreign actor',(v:Value)=>{v.actorId='SYN-OTHER';}],
    ['different scenario',(v:Value)=>{v.scenario={action:'ADD_DOUBLE_MAJOR',targetMajorId:'SYN-D'};}],
    ['missing receipt',(v:Value)=>{v.receipt='';}],
    ['invalid owner head',(v:Value)=>{v.currentVersion='invalid owner head';}],
  ])('rejects an envelope with %s',async(_name,mutate)=>{
    const value=snapshot();mutate(value);
    expect((await setup(value).post({scenario:addMinor})).statusCode).toBe(503);
  });
  it('reports the actual owner-head conflict without echoing the head',async()=>{
    const h=setup(),response=await h.post({scenario:addMinor,expectedCurrentVersion:'SYN-STALE'});
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('VERSION_CONFLICT');
    expect(response.body).not.toContain('SYN-OWNER-HEAD-1');
  });
  it('revalidates the full actor/scenario/time/version/receipt scope against the loader',async()=>{
    const value=snapshot(),h=setup(value),source=h.services.majorWhatIf!.source;
    const inspected=await source.inspect({actorId:actor.actorId,scenario:addMinor,now:NOW});
    const scope={actorId:actor.actorId,scenario:addMinor,now:NOW,asOf:NOW,
      currentVersion:inspected.currentVersion,sourceReceipt:inspected.receipt};
    expect(await source.revalidate(scope)).toBe(true);
    for(const change of [
      {actorId:'SYN-OTHER'},{sourceReceipt:'SYN-OTHER-RECEIPT'},{currentVersion:'SYN-OTHER-HEAD'},
      {scenario:{action:'REMOVE_MINOR' as const}},{asOf:APPROVED},{now:'2026-10-01T00:00:00.000Z'},
    ])expect(await source.revalidate({...scope,...change})).toBe(false);
    h.revokeSource();expect(await source.revalidate(scope)).toBe(false);
  });

  it('does not inspect without explicit ports, current consent or an authenticated owner',async()=>{
    for(const options of [{enabled:false},{rights:false}]){
      const h=setup(snapshot(),options);
      expect((await h.post()).statusCode).toBe(503);expect(h.reads()).toBe(0);
    }
    const denied=setup();denied.denyRead();
    expect((await denied.post()).statusCode).toBe(403);expect(denied.reads()).toBe(0);
    const loggedOut=setup();loggedOut.logout();
    expect((await loggedOut.post()).statusCode).toBe(401);expect(loggedOut.reads()).toBe(0);
  });
  it('requires independent approval and exact disclosure rights even with an approved snapshot',async()=>{
    const absent=setup(snapshot(),{approval:false});
    expect((await absent.post()).statusCode).toBe(503);
    const denied=setup();denied.denyApproval();expect((await denied.post()).statusCode).toBe(503);
    const undisclosed=setup();undisclosed.denyDisclosure();expect((await undisclosed.post()).statusCode).toBe(403);
    const unavailable=setup();unavailable.unavailable();expect((await unavailable.post()).statusCode).toBe(503);
  });
  it('discards computed output after revocation during awaited rights or approval checks',async()=>{
    for(const layer of ['source','rights','approval'] as const){
      const h=setup();
      h.hooks.authorize=()=>({source:h.revokeSource,rights:h.revokeRights,approval:h.revokeApproval})[layer]();
      expect((await h.post()).statusCode).toBe(403);
    }
    const h=setup();h.hooks.load=h.logout;
    expect((await h.post()).statusCode).toBe(401);
  });
  it('does not let a browser supply asOf, RulePacks, approval or an owner',async()=>{
    for(const extra of [{asOf:APPROVED},{rulePacks:[]},{approval:{}},{actorId:'SYN-OTHER'}]){
      const h=setup();expect((await h.post({scenario:addMinor,...extra})).statusCode).toBe(422);
      expect(h.reads()).toBe(0);
    }
  });

  it('does not erase core review requirements for unsettled recognition or overlap',async()=>{
    const pending=snapshot();pending.input.transcript.attempts[0]!.recognition='PENDING';
    expect((await setup(pending).post()).statusCode).toBe(503);
    const shared=snapshot();shared.input.hypothetical.secondary!.courseAreas['SYN-P-COURSE']=['SYN-M-AREA'];
    expect((await setup(shared).post()).statusCode).toBe(503);
    const nonCredit=snapshot(),pack=nonCredit.input.current.primary.pack;
    const old=pack.requirements[1]!;
    pack.requirements[1]={id:old.id,semanticKey:old.semanticKey,sourceClauseIds:old.sourceClauseIds,
      exceptionClauseIds:[],evidenceRefs:old.evidenceRefs,kind:'NON_CREDIT',criterionId:'SYN-MANUAL',verificationMode:'MANUAL'};
    expect((await setup(nonCredit).post()).statusCode).toBe(503);
  });
  it('only applies an approved overlap rule bound to both exact pack versions and the manifest',async()=>{
    function shared(){
      const v=snapshot(),bundle=v.input.hypothetical;
      bundle.secondary!.courseAreas['SYN-P-COURSE']=['SYN-M-AREA'];
      bundle.overlapRule={version:'SYN-SHARING-1',state:'APPROVED',
        primaryRulePackVersion:bundle.primary.pack.version,secondaryRulePackVersion:bundle.secondary!.pack.version,
        maxSharedCreditUnits:6,evidenceRefs:['SYN-OVERLAP-EV'],verifiedAt:APPROVED,source:sourceRef};
      v.input.overlapPolicy.ruleVersions=['SYN-SHARING-1'];
      v.input.evidenceLinks.push({evidenceRef:'SYN-OVERLAP-EV',href:ORIGIN+'/overlap',verifiedAt:APPROVED});
      v.input.approval.officialEvidenceRefs.push('SYN-OVERLAP-EV');
      return v;
    }
    const response=await setup(shared()).post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({state:'READY',hypothetical:{earnedCreditUnits:12,
      requirements:expect.arrayContaining([{requirementId:'SYN-M-REQ',state:'SATISFIED'}])}});
    for(const key of ['primaryRulePackVersion','secondaryRulePackVersion'] as const){
      const value=shared();value.input.hypothetical.overlapRule![key]='OTHER';
      expect((await setup(value).post()).statusCode).toBe(503);
    }
  });
  it.each([
    ['DOUBLE_MAJOR',double],['MINOR',minor],
  ] as const)('selects the independently approved %s secondary pack when the primary major changes',async(_role,current)=>{
    const hypothetical={primaryProgramId:'SYN-Q',secondary:current.secondary};
    const value=snapshot(current,hypothetical,{action:'CHANGE_PRIMARY_MAJOR',targetMajorId:'SYN-Q'});
    const response=await setup(value).post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({state:'READY',hypothetical:{
      rulePackVersion:'SYN-BUNDLE-H',
      requirements:expect.arrayContaining([{requirementId:current.secondary.programId+'-REQ',
        state:'MISSING',missingCreditUnits:6}]),
    }});
  });
  it('rejects reuse of a secondary pack approved for the old primary major',async()=>{
    const value=snapshot(double,{primaryProgramId:'SYN-Q',secondary:double.secondary},
      {action:'CHANGE_PRIMARY_MAJOR',targetMajorId:'SYN-Q'});
    value.input.hypothetical.secondary=value.input.current.secondary;
    value.input.hypothetical.constituentVersions[1]=value.input.current.secondary!.pack.version;
    expect((await setup(value).post()).statusCode).toBe(503);
  });
  it.each(['current','hypothetical'] as const)(
    'refuses a %s primary pack with no attested degree path rather than inferring applicability',async(side)=>{
      const value=snapshot(double,single,{action:'REMOVE_DOUBLE_MAJOR'});
      delete value.input[side].primary.pack.scope.degreePath;
      const response=await setup(value).post();
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('PROVIDER_UNAVAILABLE');
    },
  );
});
