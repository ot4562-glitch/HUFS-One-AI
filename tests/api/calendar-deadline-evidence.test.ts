import {describe,expect,it} from 'vitest';
import {OpportunitySchema} from '@hufs-one/contracts';
import {verifyCalendarDeadlineProjection} from '../../apps/api/src/modules/calendar-deadline-evidence.js';
import type {CalendarDeadlineProof} from '../../apps/api/src/modules/calendar-deadline-evidence.js';

const at='2026-11-01T00:00:00.000Z';
const date='2026-11-03T15:00:00.000Z';
const paragraph='원문 지원마감 '+date;
const source='SYN-REV1';
const textEvidence=[{
  kind:'TEXT' as const,sourceRevisionId:source,paragraphId:'PAR1',
  startCodePoint:0,endCodePoint:Array.from(paragraph).length,quote:paragraph,
}];
const proof=(kind:'NOTICE'|'OPPORTUNITY',itemId:string,field:
  'studentDeadline'|'adminReportDeadline'|'applyClosesAt',id:string,
  changed:Record<string,unknown>={}):CalendarDeadlineProof=>({
    kind,itemId,sourceRevisionId:source,
    paragraphs:[{revisionId:source,paragraphId:'PAR1',text:paragraph}],
    claims:[{claimId:id,sourceRevisionId:source,field,value:date,
      state:'VERIFIED',dateKind:field==='studentDeadline'?'STUDENT'
        :field==='adminReportDeadline'?'ADMIN':'APPLY',
      claimCheckedAt:'2026-10-31T00:00:00.000Z',reviewerId:'SYN-REVIEWER',
      evidence:textEvidence,...changed}],
  } as CalendarDeadlineProof);
const opportunity=OpportunitySchema.parse({
  id:'SYN-OP1',version:'v1',sourceSnapshotId:source,
  title:'가상 서류전형',organization:'가상기관',kind:'CONTEST',
  topicCodes:['DATA_ANALYTICS'],languageCodes:[],eventSessions:[],
  actualApplicationRoute:'DEMO_DISABLED',conditions:[],roleSteps:[],
  prioritySelection:[],completionRules:[],dataMode:'REAL',
  deadlineKind:'FIXED',applyClosesAt:date,dataQuality:'COMPLETE',
});
const notice={id:'SYN-NOTICE1',sourceSnapshotId:source,title:'가상 신청 안내',
  issuer:'합성 제공자',category:'ACADEMIC' as const,verificationState:'VERIFIED' as const,
  studentDeadline:date,evidenceRefs:['EXISTING-SOURCE']};
function input(mode:'REAL_CONSENTED'|'SYNTHETIC'|'MIXED'='REAL_CONSENTED',
  proofs:CalendarDeadlineProof[]=[]){
  return {opportunities:[{...opportunity,dataMode:mode==='SYNTHETIC'?'SYNTHETIC' as const:'REAL' as const}],
    notices:[{...notice,evidenceRefs:[...notice.evidenceRefs]}],proofs,asOf:at,actorId:'SYN-OWNER',
    authorizedRevisionIds:[source],
    revisionProvenance:{[source]:mode==='SYNTHETIC'?'SYNTHETIC' as const:'REAL_APPROVED' as const},
    datasetMode:mode};
}
describe('independent verified deadline projection before calendar/read',()=>{
  it('never reuses raw REAL dates without independently reviewed claim evidence',()=>{
    const result=verifyCalendarDeadlineProjection(input());
    expect(result.opportunities[0]).not.toHaveProperty('applyClosesAt');
    expect(result.opportunities[0]?.deadlineKind).toBe('UNKNOWN');
    expect(result.notices[0]).not.toHaveProperty('studentDeadline');
    expect(result.notices[0]?.evidenceRefs).toEqual(['EXISTING-SOURCE']);
    expect(result.acceptedClaimIdsByOpportunity).toEqual({});
  });
  it('rebuilds REAL dates from current asOf-verified exact text and links claim ids',()=>{
    const data=input('REAL_CONSENTED',[
      proof('OPPORTUNITY','SYN-OP1','applyClosesAt','CLAIM-APPLY'),
      proof('NOTICE','SYN-NOTICE1','studentDeadline','CLAIM-STUDENT'),
    ]);
    const frozen=JSON.stringify(data);
    const result=verifyCalendarDeadlineProjection(data);
    expect(result.opportunities[0]?.applyClosesAt).toBe(date);
    expect(result.notices[0]?.studentDeadline).toBe(date);
    expect(result.notices[0]?.evidenceRefs).toEqual(['EXISTING-SOURCE','CLAIM-STUDENT']);
    expect(result.acceptedClaimIdsByOpportunity).toEqual({'SYN-OP1':['CLAIM-APPLY']});
    expect(JSON.stringify(data)).toBe(frozen);
  });
  it('drops claims verified after historical asOf, without laundering cached dates',()=>{
    const data=input('REAL_CONSENTED',[
      proof('OPPORTUNITY','SYN-OP1','applyClosesAt','LATE',
        {claimCheckedAt:'2026-11-02T00:00:00Z'}),
      proof('NOTICE','SYN-NOTICE1','studentDeadline','LATE2',{state:'CANDIDATE'}),
    ]);
    const result=verifyCalendarDeadlineProjection(data);
    expect(result.opportunities[0]?.applyClosesAt).toBeUndefined();
    expect(result.notices[0]?.studentDeadline).toBeUndefined();
  });
  it('rejects a real cached date that disagrees with the independently checked source date',()=>{
    const data=input('REAL_CONSENTED',[proof('NOTICE','SYN-NOTICE1','studentDeadline','C1')]);
    data.notices[0]!.studentDeadline='2026-12-03T15:00:00Z';
    expect(()=>verifyCalendarDeadlineProjection(data)).toThrow(/does not match verified/);
  });
  it('drops evidence from a wrong source head, unapproved permission or self-review',()=>{
    const data=input('REAL_CONSENTED',[
      proof('OPPORTUNITY','SYN-OP1','applyClosesAt','C1'),
      proof('NOTICE','SYN-NOTICE1','studentDeadline','C2',{reviewerId:'SYN-OWNER'}),
    ]);
    data.authorizedRevisionIds=[];
    expect(verifyCalendarDeadlineProjection(data).opportunities[0]?.applyClosesAt).toBeUndefined();
    data.authorizedRevisionIds=[source];
    expect(verifyCalendarDeadlineProjection(data).notices[0]?.studentDeadline).toBeUndefined();
    const wrong=input('REAL_CONSENTED',[{
      ...proof('OPPORTUNITY','SYN-OP1','applyClosesAt','C3'),
      sourceRevisionId:'SYN-OLD',claims:[{
        ...proof('OPPORTUNITY','SYN-OP1','applyClosesAt','C3').claims[0]!,sourceRevisionId:'SYN-OLD',
      }],
      paragraphs:[{revisionId:'SYN-OLD',paragraphId:'PAR1',text:paragraph}],
    }]);
    expect(verifyCalendarDeadlineProjection(wrong).opportunities[0]?.applyClosesAt).toBeUndefined();
  });
  it('separates student, admin and event kind; refuses duplicate cross-item claim IDs',()=>{
    const data=input('REAL_CONSENTED',[
      proof('NOTICE','SYN-NOTICE1','studentDeadline','C1',{dateKind:'ADMIN'}),
    ]);
    expect(verifyCalendarDeadlineProjection(data).notices[0]?.studentDeadline).toBeUndefined();
    data.proofs=[
      proof('NOTICE','SYN-NOTICE1','studentDeadline','SAME'),
      proof('OPPORTUNITY','SYN-OP1','applyClosesAt','SAME'),
    ];
    expect(()=>verifyCalendarDeadlineProjection(data)).toThrow(/reused/);
  });
  it('preserves explicitly synthetic, offline demonstration dates only',()=>{
    const data=input('SYNTHETIC');
    const result=verifyCalendarDeadlineProjection(data);
    expect(result.opportunities[0]?.applyClosesAt).toBe(date);
    expect(result.notices[0]?.studentDeadline).toBe(date);
    expect(result.acceptedClaimIdsByOpportunity).toEqual({});
  });
});
