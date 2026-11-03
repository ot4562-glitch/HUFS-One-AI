import {describe,expect,it} from 'vitest';
import {OwnerDoubleMajorAuditSchema} from '../../packages/contracts/src/academics/double-major.js';

const at='2026-11-03T00:00:00.000Z';
const audit={state:'READY',rulePackVersion:'SYN-P',asOf:at,earnedCreditUnits:6,inProgressCreditUnits:0,plannedCreditUnits:0,
  projectedUniqueCreditUnits:6,pendingRecognitionCreditUnits:0,areaProgress:[],requirements:[],caveats:[]};
const checked=()=>({status:'CHECKED',state:'READY',asOf:at,selection:'NONE',missingInputs:[],
  uniqueCredits:{earnedCreditUnits:6,inProgressCreditUnits:0,plannedCreditUnits:0,projectedCreditUnits:6},
  primary:{role:'PRIMARY_MAJOR',majorId:'SYN-PRIMARY',rulePack:{version:'SYN-P',state:'APPROVED'},audit},
  doubleMajor:{role:'DOUBLE_MAJOR',majorId:null,status:'NOT_APPLICABLE',rulePack:{version:null,state:'MISSING'},audit:null},
  overlap:{status:'NONE',sharedCourses:[],sharedCreditUnits:0,evidenceRefs:[],heldRequirementIds:{primary:[],doubleMajor:[]},rowImpacts:{primary:[],doubleMajor:[]}},
  disclosure:{mode:'OWNER_VERIFIED',visibleCourseRefs:[],withheldSharedCourseCount:0},evidenceLinks:[],
  versions:{profile:'SYN-PROFILE-1',transcript:'SYN-T1',projection:'SYN-PROJECTION-1'},
  caveats:['NOT_OFFICIAL_GRADUATION_DECISION']});
describe('current double-major public contract',()=>{
  it('keeps NONE distinct from UNSET and missing approved inputs',()=>{
    expect(OwnerDoubleMajorAuditSchema.safeParse(checked()).success).toBe(true);
    expect(OwnerDoubleMajorAuditSchema.safeParse({...checked(),selection:'UNSET'}).success).toBe(false);
    const unset={...checked(),state:'NEEDS_REVIEW',selection:'UNSET',doubleMajor:{...checked().doubleMajor,status:'INPUT_REQUIRED'}};
    expect(OwnerDoubleMajorAuditSchema.safeParse(unset).success).toBe(true);
    const missing={...checked(),status:'INPUT_REQUIRED',state:'INSUFFICIENT_DATA',missingInputs:['TRANSCRIPT'],uniqueCredits:null,
      primary:{...checked().primary,audit:null},doubleMajor:{...checked().doubleMajor,status:'NOT_CHECKED'},overlap:null};
    expect(OwnerDoubleMajorAuditSchema.safeParse(missing).success).toBe(true);
  });
  it('rejects raw attempts, identity, inconsistent totals and false READY rule states',()=>{
    for(const value of [{...checked(),actorId:'secret-owner'},
      {...checked(),primary:{...checked().primary,audit:{...audit,excludedAttempts:[]}}},
      {...checked(),uniqueCredits:{...checked().uniqueCredits,earnedCreditUnits:12}},
      {...checked(),primary:{...checked().primary,rulePack:{version:'wrong',state:'APPROVED'}}},
      {...checked(),primary:{...checked().primary,rulePack:{version:'SYN-P',state:'DRAFT'}}}])
      expect(OwnerDoubleMajorAuditSchema.safeParse(value).success).toBe(false);
  });
  it('requires both role audits to report the same unique transcript totals',()=>{
    const value={...checked(),selection:'SELECTED',doubleMajor:{...checked().doubleMajor,majorId:'SYN-D',status:'CHECKED',
      rulePack:{version:'SYN-D1',state:'APPROVED'},audit:{...audit,rulePackVersion:'SYN-D1',earnedCreditUnits:12,projectedUniqueCreditUnits:12}}};
    expect(OwnerDoubleMajorAuditSchema.safeParse(value).success).toBe(false);
  });
});
