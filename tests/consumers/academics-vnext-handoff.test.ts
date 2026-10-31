import {describe,it,expect} from 'vitest';
import {
  AcademicTermVNextSchema,AcademicRequirementVNextSchema,
  AcademicRequirementProgressVNextSchema,AcademicAuditVNextSchema,
  AcademicRulePackVNextSchema,NoticeResultSchema,AcademicSummarySchema,
} from '@hufs-one/contracts';
import {fixture} from '../contracts/helpers.js';

/** Four consumer-boundary smoke tests. No real student/official academic data. */
describe('PR #13 feedback vNext four-track type handshake (synthetic only)',()=>{
  it('academics: K_OF_N course IDs and counts must be explicit before implementing a solver',()=>{
    const choice={
      id:'REQ-K',semanticKey:'synthetic-elective',
      kind:'K_OF_N',courseIds:['SYN-A','SYN-B','SYN-C'],k:2,
      sourceClauseIds:['CLAUSE-1'],exceptionClauseIds:[],
      evidenceRefs:['SYN-EVIDENCE-1'],
    };
    expect(AcademicRequirementVNextSchema.safeParse(choice).success).toBe(true);
    expect(AcademicRequirementVNextSchema.safeParse({
      ...choice,courseIds:[],k:2,
    }).success).toBe(false);
  });
  it('notice: requirement IDs are explicit and cannot silently invent a new ID',()=>{
    const legacyNotice=NoticeResultSchema.parse(
      fixture<{notices:unknown}>('synthetic/demo-snapshot.json').notices,
    );
    expect(legacyNotice.items.length).toBeGreaterThan(0);
    const parsed=AcademicRequirementProgressVNextSchema.safeParse({
      requirementId:'REQ-EXPLICIT',state:'SATISFIED',
      remainingCreditUnits:0,evidenceRefs:['SYN-EVIDENCE-1'],
    });
    expect(parsed.success).toBe(true);
    expect(AcademicRequirementProgressVNextSchema.safeParse({
      ...parsed.data,requirementId:'',
    }).success).toBe(false);
  });
  it('UI: source-only future snapshots cannot silently replace old summary wire types',()=>{
    const oldSummary=AcademicSummarySchema.parse(
      fixture('synthetic/academic-summary.json'),
    );
    expect(oldSummary.state).toBe('NEEDS_REVIEW');
    expect(AcademicAuditVNextSchema.safeParse({
      ...oldSummary,projectedUniqueCreditUnits:12,
    }).success).toBe(false);
    // A human-approved API/UI migration needs an explicit adapter; do not
    // pretend an old DemoSnapshot consumes the new fields automatically.
  });
  it('API: unreviewed RulePack/forecast term is not a trusted server decision',()=>{
    expect(AcademicTermVNextSchema.safeParse('2027-1').success).toBe(true);
    expect(AcademicTermVNextSchema.safeParse('2027-UNKNOWN').success).toBe(false);
    const legacyPack=fixture<Record<string,unknown>>('synthetic/rulepack.json');
    expect(AcademicRulePackVNextSchema.safeParse(legacyPack).success).toBe(false);
  });
});
