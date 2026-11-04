import {describe,expect,it} from 'vitest';
import {createTrustedOwnerDoubleMajorSource,ApprovedOwnerDoubleMajorInputSchema} from '../../apps/api/src/modules/academics/owner-double-major-source.js';
const at='2026-11-03T00:00:00.000Z';
const ref={sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERM'};
import {doubleMajorInput} from './owner-double-major-fixture.js';

const sourceFor=(value:unknown)=>createTrustedOwnerDoubleMajorSource({snapshots:{load:async()=>({actorId:'SYN-OWNER',asOf:at,receipt:'SYN-RECEIPT',projectionVersion:'SYN-PROJ-1',input:value}),revalidate:async()=>true}});
describe('approved current double-major source bridge',()=>{
  it('uses each role pack and the existing core while withholding raw transcript tokens',async()=>{
    const source=sourceFor(doubleMajorInput()),value=await source.inspect({actorId:'SYN-OWNER',now:at});
    expect(value.check).toMatchObject({status:'CHECKED',state:'NEEDS_REVIEW',selection:'SELECTED',uniqueCredits:{earnedCreditUnits:6},
      primary:{role:'PRIMARY_MAJOR',rulePack:{version:'PRIMARY_MAJOR-V1',state:'APPROVED'}},
      doubleMajor:{status:'CHECKED',rulePack:{version:'DOUBLE_MAJOR-V1',state:'APPROVED'}},
      overlap:{status:'NO_APPROVED_RULE',sharedCreditUnits:6,heldRequirementIds:{primary:['SYN-P-REQ'],doubleMajor:['SYN-D-REQ']}}});
    expect(JSON.stringify(value.check)).not.toContain('PRIVATE-ATTEMPT-TOKEN');
    expect(JSON.stringify(value.check)).not.toContain('actorId');
  });
  it('keeps NONE, UNSET, selected missing rules and missing transcript distinct',async()=>{
    const scenarios=[{selection:{status:'NONE'},pack:null,want:'NOT_APPLICABLE'},
      {selection:{status:'UNSET'},pack:null,want:'INPUT_REQUIRED'},
      {selection:{status:'SELECTED',majorId:'SYN-D'},pack:null,want:'RULES_MISSING'}];
    for(const scenario of scenarios){
      const base=doubleMajorInput();
      const value={...base,profile:{...base.profile,secondaryMajor:scenario.selection},doubleMajor:scenario.pack};
      expect((await sourceFor(value).inspect({actorId:'SYN-OWNER',now:at})).check).toMatchObject({selection:scenario.selection.status,doubleMajor:{status:scenario.want}});
    }
    const missing={...doubleMajorInput(),transcript:null};
    expect((await sourceFor(missing).inspect({actorId:'SYN-OWNER',now:at})).check).toMatchObject({status:'INPUT_REQUIRED',state:'INSUFFICIENT_DATA',missingInputs:['TRANSCRIPT'],uniqueCredits:null});
  });
  it('rejects wrong role/cohort/selected major, omitted original inventory and future approval',async()=>{
    for(const mutate of [
      (value:ReturnType<typeof doubleMajorInput>)=>{value.doubleMajor.pack.scope.secondaryMajor='OTHER';},
      (value:ReturnType<typeof doubleMajorInput>)=>{value.primary.pack.scope.cohortFrom=2025;value.primary.pack.scope.cohortTo=2025;},
      (value:ReturnType<typeof doubleMajorInput>)=>{value.doubleMajor.trustedOriginal.clauses=[];},
      (value:ReturnType<typeof doubleMajorInput>)=>{value.approval.verifiedAt='2027-01-01T00:00:00.000Z';},
    ]){const input=doubleMajorInput();mutate(input);await expect(sourceFor(input).inspect({actorId:'SYN-OWNER',now:at})).rejects.toThrow();}
  });
  it('redacts shared course identities unless the approved visibility permits them',async()=>{
    const base=doubleMajorInput();
    const value={...base,visibility:{mode:'REDACTED',allowedCourseRefs:[]}};
    const result=await sourceFor(value).inspect({actorId:'SYN-OWNER',now:at});
    expect(result.check).toMatchObject({overlap:{sharedCourses:[],sharedCreditUnits:6},disclosure:{withheldSharedCourseCount:1,visibleCourseRefs:[]}});
    expect(JSON.stringify(result.check)).not.toContain('SYN-SHARED');
  });
  it('does not accept browser-like approval or unknown operator payload fields',()=>{
    expect(ApprovedOwnerDoubleMajorInputSchema.safeParse({...doubleMajorInput(),actorId:'spoofed'}).success).toBe(false);
  });
  it('uses only explicitly approved version-bound overlap rules and retains drafts for review',async()=>{
    const base=doubleMajorInput();
    const rule={version:'SYN-OVERLAP-V1',state:'APPROVED',primaryRulePackVersion:base.primary.pack.version,doubleMajorRulePackVersion:base.doubleMajor.pack.version,
      maxSharedCreditUnits:6,evidenceRefs:['DOUBLE_MAJOR-EVIDENCE'],verifiedAt:at,source:ref};
    expect((await sourceFor({...base,overlapRule:rule}).inspect({actorId:'SYN-OWNER',now:at})).check).toMatchObject({state:'READY',overlap:{status:'COVERED_BY_APPROVED_RULE',evidenceRefs:['DOUBLE_MAJOR-EVIDENCE']}});
    expect((await sourceFor({...base,overlapRule:{...rule,maxSharedCreditUnits:0}}).inspect({actorId:'SYN-OWNER',now:at})).check).toMatchObject({state:'NEEDS_REVIEW',overlap:{status:'OVER_APPROVED_LIMIT'}});
    const {approvedBy:_approver,independentlyCheckedBy:_checker,approvedAt:_at,...draft}=base.primary.pack;
    expect((await sourceFor({...base,primary:{...base.primary,pack:{...draft,state:'DRAFT'}}}).inspect({actorId:'SYN-OWNER',now:at})).check).toMatchObject({state:'NEEDS_REVIEW',primary:{rulePack:{state:'DRAFT'},audit:{state:'NEEDS_REVIEW'}}});
  });
});
