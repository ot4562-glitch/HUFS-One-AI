import {afterEach, describe, expect, it} from 'vitest';
import {OwnerStudyPlanCheckResponseSchema} from '@hufs-one/contracts';
import {createTrustedOwnerStudyPlanSource} from
  '../../apps/api/src/modules/academics/owner-study-plan-source.js';
import type {ApprovedOwnerStudyPlanSnapshot} from
  '../../apps/api/src/modules/academics/owner-study-plan-source.js';
import {registerOwnerStudyPlanCheckRoutes} from
  '../../apps/api/src/modules/profiles/owner-study-plan-check-http.js';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';

const NOW='2026-11-01T00:00:00.000Z', TERM='2027-1';
const ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER-A',
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-11-20T00:00:00Z',
  schoolMailProofExpiresAt:'2026-11-20T00:00:00Z'};
const courses=['SYN-A','SYN-B'];
const link=(evidenceRef:string)=>({evidenceRef,
  href:`https://synthetic.invalid/evidence/${evidenceRef}`,verifiedAt:NOW});

function snapshot():ApprovedOwnerStudyPlanSnapshot {
  return {
    actorId:actor.actorId,term:TERM,asOf:NOW,receipt:'SYN-SNAPSHOT-RECEIPT-1',
    transcript:{version:'SYN-TRANSCRIPT-1',state:'APPROVED',attempts:[{
      attemptToken:'SYN-PRIVATE-ATTEMPT',canonicalCourseId:'SYN-EARNED',
      creditUnits:6,ledger:'EARNED',areaIds:[],recognition:'RECOGNIZED',term:'2026-1',
    }]},
    plan:{version:'SYN-PLAN-1',items:courses.map(courseId=>({
      kind:'STUDY_PLAN',dataMode:'SYNTHETIC',state:'DRAFT',
      courseId,targetTerm:TERM,planned:true,
    }))},
    catalog:{version:'SYN-CATALOG-1',courseCreditUnits:{'SYN-A':6,'SYN-B':6},
      sections:courses.map((canonicalCourseId,index)=>({
        canonicalCourseId,sectionId:`${canonicalCourseId}-01`,term:TERM,
        meetings:[{day:'MON',startMinute:540+index*60,endMinute:600+index*60}],
        evidenceRefs:['SYN-SECTIONS'],verifiedAt:NOW,
      }))},
    rulePack:{version:'SYN-RULEPACK-1',state:'APPROVED',
      termRules:{creditCapUnits:10,capEvidenceRefs:['SYN-CAP']}},
    approval:{rulePackState:'APPROVED',rulePackVersion:'SYN-RULEPACK-1',
      officialEvidenceRefs:['SYN-CAP'],verifiedAt:NOW,
      sourceRightsVersion:'SYN-RIGHTS-1',consentVersion:'SYN-CONSENT-1',
      coreVersion:'SYN-CORE-116'},
    evidenceLinks:[link('SYN-CAP'),link('SYN-SECTIONS'),link('SYN-UNUSED-EVIDENCE')],
    visibility:{mode:'OWNER_VERIFIED',allowedCourseRefs:[...courses,'SYN-EARNED']},
  };
}

function fixture(initial:ApprovedOwnerStudyPlanSnapshot|null=snapshot()) {
  let current=initial,valid=true;
  const source=createTrustedOwnerStudyPlanSource({snapshots:{
    load:async()=>current,
    revalidate:async input=>valid&&input.actorId===actor.actorId
      &&input.receipt==='SYN-SNAPSHOT-RECEIPT-1',
  }});
  const inspect=()=>source.inspect({actorId:actor.actorId,term:TERM,now:NOW,
    expectedPlanVersion:'SYN-PLAN-1'});
  return {source,inspect,set:(next:ApprovedOwnerStudyPlanSnapshot|null)=>{current=next;},
    revoke:()=>{valid=false;}};
}

const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});

describe('trusted owner academic snapshot adapter (#81)',()=>{
  it('runs the academic core on server plan/catalog/ledger and emits a strict private-safe response',async()=>{
    const original=snapshot(),before=structuredClone(original);
    const result=await fixture(original).inspect();
    const check=OwnerStudyPlanCheckResponseSchema.parse(result.check);
    expect(check).toMatchObject({state:'READY',term:TERM,asOf:NOW,
      termLoadCreditUnits:12,creditCapUnits:10,
      versions:{rulePack:'SYN-RULEPACK-1',plan:'SYN-PLAN-1',
        transcript:'SYN-TRANSCRIPT-1',catalog:'SYN-CATALOG-1'},
      planIssues:[{code:'CREDIT_CAP_EXCEEDED',reasonCode:'EXCEEDS_APPROVED_LIMIT',
        courseRefs:['SYN-A','SYN-B'],evidenceRefs:['SYN-CAP']}],
      disclosure:{mode:'OWNER_VERIFIED',visibleCourseRefs:['SYN-A','SYN-B']},
    });
    expect(check.evidenceLinks).toEqual([link('SYN-CAP')]);
    expect(JSON.stringify(result.check)).not.toContain('SYN-PRIVATE-ATTEMPT');
    expect(JSON.stringify(result.check)).not.toContain('SYN-EARNED');
    expect(original).toEqual(before);
    original.approval.officialEvidenceRefs.push('SYN-LATE-MUTATION');
    expect(check.approval?.officialEvidenceRefs).toEqual(['SYN-CAP']);
  });

  it('retains core review findings for unconfirmed and undecided saved courses',async()=>{
    const loaded=snapshot();
    loaded.catalog.sections=[];
    loaded.plan.items=[...loaded.plan.items,{kind:'STUDY_PLAN',dataMode:'SYNTHETIC',
      state:'DRAFT',courseId:'SYN-UNKNOWN',targetTerm:'UNDECIDED',planned:true}];
    loaded.visibility.allowedCourseRefs.push('SYN-UNKNOWN');
    const check=OwnerStudyPlanCheckResponseSchema.parse((await fixture(loaded).inspect()).check);
    expect(check.state).toBe('NEEDS_REVIEW');
    expect(check.unchecked).toEqual([{courseId:'SYN-UNKNOWN',reason:'TERM_UNDECIDED'}]);
    expect(check.caveats).toContain('SECTIONS_UNCONFIRMED');
    expect(check.caveats).toContain('PLAN_PARTIALLY_CHECKED');
  });

  it('redacts unauthorized course identities while keeping computed loads and warnings',async()=>{
    const loaded=snapshot();
    loaded.visibility={mode:'REDACTED',allowedCourseRefs:[]};
    const check=OwnerStudyPlanCheckResponseSchema.parse((await fixture(loaded).inspect()).check);
    expect(check.termLoadCreditUnits).toBe(12);
    expect(check.planIssues).toEqual([{code:'CREDIT_CAP_EXCEEDED',
      reasonCode:'EXCEEDS_APPROVED_LIMIT',courseRefs:[],evidenceRefs:['SYN-CAP']}]);
    expect(check.disclosure).toEqual({mode:'REDACTED',visibleCourseRefs:[]});
    expect(check.caveats).toContain('COURSE_REFS_REDACTED');
    expect(JSON.stringify(check)).not.toContain('SYN-A');
  });

  it('keeps only actual used grant-scoped course refs and preserves the server grant version',async()=>{
    const loaded=snapshot();
    loaded.visibility={mode:'GRANT_SCOPED',grantVersion:'SYN-GRANT-1',
      allowedCourseRefs:['SYN-A','SYN-EARNED']};
    const check=OwnerStudyPlanCheckResponseSchema.parse((await fixture(loaded).inspect()).check);
    expect(check.disclosure).toEqual({mode:'GRANT_SCOPED',grantVersion:'SYN-GRANT-1',
      visibleCourseRefs:['SYN-A']});
    expect(check.planIssues[0]?.courseRefs).toEqual(['SYN-A']);
    expect(check.caveats).toContain('COURSE_REFS_REDACTED');
  });

  it('fails closed when no approved snapshot exists',async()=>{
    await expect(fixture(null).inspect()).rejects.toThrow();
  });

  it.each(['actor','term','asOf','receipt','plan','rulePack','transcript','approval'] as const)(
    'rejects a mismatched or unapproved %s binding before returning a check',async field=>{
      const loaded=snapshot();
      if(field==='actor')loaded.actorId='SYN-OTHER';
      if(field==='term')loaded.term='2027-2';
      if(field==='asOf')loaded.asOf='2026-11-02T00:00:00.000Z';
      if(field==='receipt')loaded.receipt='short';
      if(field==='plan')loaded.plan.version='invalid plan version';
      if(field==='rulePack')loaded.rulePack.version='SYN-OTHER-PACK';
      if(field==='transcript')Object.assign(loaded.transcript,{state:'DRAFT'});
      if(field==='approval')Object.assign(loaded.rulePack,{state:'DRAFT'});
      await expect(fixture(loaded).inspect()).rejects.toThrow();
    });

  it('rejects missing evidence, future receipts and unbound rule evidence',async()=>{
    const missing=snapshot();missing.evidenceLinks=[];
    const future=snapshot();future.approval.verifiedAt='2026-11-02T00:00:00Z';
    const unbound=snapshot();unbound.rulePack.termRules.capEvidenceRefs=['SYN-SECTIONS'];
    for(const loaded of [missing,future,unbound])
      await expect(fixture(loaded).inspect()).rejects.toThrow();
  });

  it('uses independent route approval and postread source/rights gates around a real core result',async()=>{
    const h=fixture();
    let approved=true,rights=true;
    const verify=async()=>actor;
    const app=createApi({allowedOrigin:ORIGIN,
      repository:new MemoryApiRepository({profiles:[]}),verifySession:verify,now:()=>NOW});
    apps.push(app);
    registerOwnerStudyPlanCheckRoutes({app,session:{verify,now:()=>NOW},source:h.source,
      rights:{mayInspect:async()=>true,
        authorize:async input=>({allowed:input.courseRefs.every(ref=>courses.includes(ref))
          &&input.evidenceRefs.every(ref=>ref==='SYN-CAP'),rightsReceipt:'SYN-RIGHTS-RECEIPT'}),
        revalidate:async()=>rights},
      approvalGate:{isApproved:async input=>approved&&input.coreVersion==='SYN-CORE-116'
        &&input.rulePackVersion==='SYN-RULEPACK-1'},
    });
    const post=(expectedPlanVersion='SYN-PLAN-1')=>app.inject({method:'POST',url:'/api/study-plans/check',
      headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},
      payload:{term:TERM,expectedPlanVersion}});
    const ready=await post();
    expect(ready.statusCode).toBe(200);
    expect(ready.json().planIssues[0].code).toBe('CREDIT_CAP_EXCEEDED');
    expect((await post('SYN-OLD-PLAN')).statusCode).toBe(409);
    approved=false;
    expect((await post()).statusCode).toBe(503);
    approved=true;rights=false;
    expect((await post()).statusCode).toBe(403);
    rights=true;h.revoke();
    expect((await post()).statusCode).toBe(403);
  });
});
