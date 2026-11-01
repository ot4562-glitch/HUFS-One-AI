import {describe,expect,it} from 'vitest';
import {
  SelfProfilePatchSchema,SelfConsentPutSchema,OwnerTranscriptSchema,
  CourseCatalogPageSchema,CourseOfferingsPageSchema,OpportunityCatalogPageSchema,
  OwnerWorkspaceCreateSchema,OwnerWorkspaceUpdateSchema,
  TOPIC_CODES,
} from '@hufs-one/contracts';
const at='2026-11-01T00:00:00.000Z';
const syntheticSource={sourceId:'SYN-S',revisionId:'SYN-R',
  permissionRef:'SYN-P',status:'SYNTHETIC'};
describe('Architecture A13 owner and catalog Zod negative contracts',()=>{
  it('accepts a strict owner profile but rejects client actorId, stale or fabricated interests',()=>{
    const value={displayName:'가상',interestTopics:['DATA_ANALYTICS'],desiredJobTopics:[]};
    expect(SelfProfilePatchSchema.safeParse({expectedVersion:0,value}).success).toBe(true);
    expect(SelfProfilePatchSchema.safeParse({expectedVersion:0,value,actorId:'ROOT'}).success).toBe(false);
    expect(SelfProfilePatchSchema.safeParse({expectedVersion:0,value:{
      ...value,interestTopics:['MADE_UP_TOPIC'],
    }}).success).toBe(false);
    expect(SelfProfilePatchSchema.safeParse({expectedVersion:0,value:{
      ...value,interestTopics:TOPIC_CODES.slice(0,6),
    }}).success).toBe(false);
    expect(SelfProfilePatchSchema.safeParse({expectedVersion:-1,value}).success).toBe(false);
  });
  it('enforces all five independent consent choices and expected version',()=>{
    const choices={personalStorage:false,teamReview:false,externalAi:false,
      ncpStorage:false,presentation:false};
    expect(SelfConsentPutSchema.safeParse({expectedVersion:0,choices}).success).toBe(true);
    expect(SelfConsentPutSchema.safeParse({expectedVersion:0,choices:{
      ...choices,externalAi:'yes',
    }}).success).toBe(false);
    expect(SelfConsentPutSchema.safeParse({expectedVersion:0,choices:{
      ...choices,extraPermission:true,
    }}).success).toBe(false);
    expect(SelfConsentPutSchema.safeParse({expectedVersion:1,choices:{
      teamReview:false,
    }}).success).toBe(false);
  });
  it('never allows pending transcript to masquerade as approved owner-only ledger',()=>{
    const transcript={state:'OWNER_APPROVED',asOf:at,reviewedAt:at,
      sourceRevisionId:'SYN-R',sourceRightsVersion:'v1',courses:[{
        term:'2026-1',courseCode:'SYN01',courseName:'가상 과목',
        category:'합성',ledger:'EARNED',creditUnits:6,
      }]};
    expect(OwnerTranscriptSchema.safeParse(transcript).success).toBe(true);
    expect(OwnerTranscriptSchema.safeParse({...transcript,state:'STUDENT_REVIEW_PENDING'}).success).toBe(false);
    expect(OwnerTranscriptSchema.safeParse({...transcript,
      courses:[{...transcript.courses[0],creditUnits:-1}]}).success).toBe(false);
    expect(OwnerTranscriptSchema.safeParse({...transcript,
      courses:[{...transcript.courses[0],ledger:'IN_PROGRESS'}]}).success).toBe(true);
    expect(OwnerTranscriptSchema.safeParse({...transcript,
      courses:[{...transcript.courses[0],ledger:'PLANNED'}]}).success).toBe(false);
  });
  it('keeps an offering list to one official catalog fact per regular term',()=>{
    const item={courseId:'SYN-C1',term:'2026-1',status:'UNKNOWN' as const,source:syntheticSource};
    const active={...syntheticSource,status:'ACTIVE' as const,verifiedAt:at};
    expect(CourseOfferingsPageSchema.safeParse({asOf:at,nextCursor:null,items:[item]}).success).toBe(true);
    expect(CourseOfferingsPageSchema.safeParse({asOf:at,nextCursor:null,items:[
      {...item,status:'CONFIRMED_OFFERED',source:active},
    ]}).success).toBe(true);
    expect(CourseOfferingsPageSchema.safeParse({asOf:at,nextCursor:null,items:[
      {...item,status:'CONFIRMED_OFFERED'},
    ]}).success).toBe(false);
    expect(CourseOfferingsPageSchema.safeParse({asOf:at,nextCursor:null,items:[
      {...item,status:'HISTORICAL_PATTERN'},
    ]}).success).toBe(false);
    expect(CourseOfferingsPageSchema.safeParse({asOf:at,nextCursor:null,items:[
      {...item,term:'2026-3'},
    ]}).success).toBe(false);
    expect(CourseOfferingsPageSchema.safeParse({asOf:at,nextCursor:null,items:[
      {...item,status:'CONFIRMED_OFFERED',source:active},
      {...item,status:'CONFIRMED_NOT_OFFERED',source:active},
    ]}).success).toBe(false);
  });
  it('requires human verifiedAt for ACTIVE source metadata',()=>{
    const item={courseId:'SYN-C1',courseCode:'SYN01',title:'가상',campus:'SEOUL',
      creditUnits:6,source:syntheticSource};
    expect(CourseCatalogPageSchema.safeParse({
      asOf:at,nextCursor:null,items:[item],
    }).success).toBe(true);
    expect(CourseCatalogPageSchema.safeParse({asOf:at,nextCursor:null,
      items:[{...item,source:{...syntheticSource,status:'ACTIVE'}}],
    }).success).toBe(false);
  });
  it('requires source synthetic/real consistency for every opportunity',()=>{
    const o={id:'SYN-OP1',version:'1',sourceSnapshotId:'SYN-R',
      title:'가상 공고',organization:'가상기관',kind:'CONTEST',
      topicCodes:['DATA_ANALYTICS'],languageCodes:[],eventSessions:[],
      actualApplicationRoute:'DEMO_DISABLED',conditions:[],roleSteps:[],
      prioritySelection:[],completionRules:[],dataMode:'SYNTHETIC',dataQuality:'COMPLETE'};
    expect(OpportunityCatalogPageSchema.safeParse({asOf:at,nextCursor:null,
      items:[{opportunity:o,source:syntheticSource}],
    }).success).toBe(true);
    expect(OpportunityCatalogPageSchema.safeParse({asOf:at,nextCursor:null,
      items:[{opportunity:{...o,dataMode:'REAL'},source:syntheticSource}],
    }).success).toBe(false);
  });
  it('prevents forged action-state, invalid semesters and unapproved experience completion',()=>{
    const exp={kind:'EXPERIENCE',dataMode:'SYNTHETIC',state:'DRAFT',
      title:'가상 경험',summary:'',startedOn:'2026-11-01',endedOn:'2026-10-01'};
    expect(OwnerWorkspaceCreateSchema.safeParse({itemId:'SYN-A',value:exp}).success).toBe(false);
    expect(OwnerWorkspaceCreateSchema.safeParse({itemId:'SYN-A',value:{
      ...exp,endedOn:'2026-12-01',
    }}).success).toBe(true);
    expect(OwnerWorkspaceCreateSchema.safeParse({itemId:'SYN-A',value:{
      kind:'STUDY_PLAN',state:'DRAFT',dataMode:'SYNTHETIC',courseId:'SYN-COURSE',
      targetTerm:'2026-3',planned:true,
    }}).success).toBe(false);
    expect(OwnerWorkspaceUpdateSchema.safeParse({expectedVersion:1,value:{
      kind:'EXPERIENCE',state:'APPROVED',dataMode:'SYNTHETIC',
      title:'허위 완료',summary:'',
    }}).success).toBe(false);
  });
});
