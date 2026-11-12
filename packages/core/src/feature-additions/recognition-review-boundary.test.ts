import {describe,expect,it} from 'vitest';
import {classifyProofCandidate,prepareRecognitionV2} from './recognition-v2.js';
import {FIXED_NOW,recognitionRule,proof,source} from './v2.fixtures.js';

const candidate={
  rule:recognitionRule(),assetId:'SYN-OWNER-PROOF-1',proposedKind:'CERTIFICATE',
  evidencePage:0,confidence:0.94,ownerConfirmed:true,asOf:FIXED_NOW,
};
describe('#346 private OCR classification never becomes official recognition',()=>{
  it('accepts only an owner-confirmed candidate under a current verified rule',()=>{
    expect(classifyProofCandidate(candidate)).toEqual({
      assetId:'SYN-OWNER-PROOF-1',status:'OWNER_CONFIRMED_CANDIDATE',
      documentKind:'CERTIFICATE',
    });
    const r=prepareRecognitionV2({rule:candidate.rule,
      activity:{id:'SYN-ACTIVITY',kind:'VOLUNTEER',
        endedAt:'2026-10-30T00:00:00Z'},proofs:[],asOf:FIXED_NOW});
    expect(r.officiallyRecognized).toBe(false);
  });
  it.each([
    ['owner has not confirmed',{ownerConfirmed:false},'NEEDS_REVIEW'],
    ['missing page',{evidencePage:undefined},'REJECTED'],
    ['negative page',{evidencePage:-1},'REJECTED'],
    ['huge page',{evidencePage:51},'REJECTED'],
    ['decimal page',{evidencePage:0.3},'REJECTED'],
    ['negative confidence',{confidence:-0.1},'REJECTED'],
    ['confidence greater than one',{confidence:1.01},'REJECTED'],
    ['missing confidence',{confidence:undefined},'REJECTED'],
    ['not a number confidence',{confidence:NaN},'REJECTED'],
    ['empty asset ID',{assetId:''},'REJECTED'],
    ['asset ID outside bounded format',{assetId:'../../private'},'REJECTED'],
    ['unknown document kind',{proposedKind:'PASSPORT'},'REJECTED'],
    ['unverified source revision',{rule:recognitionRule({
      source:{...source(),status:'NEEDS_REVIEW'}})},'REJECTED'],
    ['revoked source',{rule:recognitionRule({
      source:{...source(),status:'REVOKED'}})},'REJECTED'],
    ['blocked rights',{rule:recognitionRule({
      source:{...source(),rights:'BLOCKED'}})},'REJECTED'],
    ['no owner-confirmation asOf',{asOf:undefined},'REJECTED'],
    ['past effective period',{asOf:'2025-01-01T00:00:00Z'},'REJECTED'],
    ['expired official application period',{rule:recognitionRule({
      applicationEndsAt:'2026-11-01T00:00:00Z'})},'REJECTED'],
  ] as const)('fails closed on %s',(_case,overrides,expected)=>{
    expect(classifyProofCandidate({...candidate,...overrides}).status).toBe(expected);
  });
  it.each(['CERTIFICATE','PARTICIPATION_PROOF','ACTIVITY_REPORT','AWARD_PROOF','OTHER'])(
    'candidate kind %s requires that kind in independently verified document rule',kind=>{
      const rule=recognitionRule({documentGroups:[{id:'SYN-REQUIRED',join:'ALL',kinds:[kind]}]});
      expect(classifyProofCandidate({...candidate,rule,proposedKind:kind}).status)
        .toBe('OWNER_CONFIRMED_CANDIDATE');
      expect(classifyProofCandidate({...candidate,rule,proposedKind:'SYN-OTHER-KIND'}).status)
        .toBe('REJECTED');
    });
  it('does not count an unreviewed OCR candidate as accepted evidence',()=>{
    const result=prepareRecognitionV2({rule:recognitionRule(),
      activity:{id:'SYN-ACTIVITY',kind:'VOLUNTEER'},asOf:FIXED_NOW,
      proofs:[proof('CERTIFICATE',{activityId:'SYN-ACTIVITY',ownerReviewed:false}),
        proof('REPORT',{activityId:'SYN-ACTIVITY',ownerReviewed:false})]});
    expect(result.status).toBe('DOCUMENTS_PENDING');
    expect(result.missingKinds).toEqual(['CERTIFICATE','REPORT']);
    expect(result.checkedProofIds).toEqual([]);
  });
  it('keeps a valid self-reported document separate from institutional recognition',()=>{
    const result=prepareRecognitionV2({rule:recognitionRule(),
      activity:{id:'SYN-ACTIVITY',kind:'VOLUNTEER'},asOf:FIXED_NOW,
      proofs:[proof('CERTIFICATE',{activityId:'SYN-ACTIVITY'}),
        proof('REPORT',{activityId:'SYN-ACTIVITY'})]});
    expect(result.status).toBe('READY_FOR_OFFICIAL_REVIEW');
    expect(result.officiallyRecognized).toBe(false);
  });
});
