import {describe,expect,it} from 'vitest';
import type {ActivityChannel,ActivityOrganization,ActivityRecord} from '@hufs-one/contracts';
import {reviewSyntheticActivityIntake} from './activity-intake.js';
import {currentActivityRecords} from './activities.js';

const AS_OF='2026-06-01T00:00:00Z';
const org:ActivityOrganization={
  organizationId:'SYN-ECON',displayName:'가상 경제학부 학생회',
  campus:'SEOUL',aliases:['가상 과거 학생회명'],
  verifiedAt:'2026-01-01T00:00:00Z',
};
const channel:ActivityChannel={
  channelId:'SYN-BOARD',organizationId:'SYN-ECON',
  sourceBaseUrl:'https://example.org/synthetic/events',
  verifiedAt:'2026-01-01T00:00:00Z',
  effectiveFrom:'2026-01-01T00:00:00Z',
  rights:'APPROVED',provenance:'SYNTHETIC',status:'ACTIVE',reviewRef:'SYN-INDEPENDENT-REVIEW',
};
const record:ActivityRecord={
  entryId:'SYN-EVENT',sourceId:'SYN-EVENT-SOURCE',revisionId:'SYN-EVENT-REV',
  channelId:'SYN-BOARD',organizationId:'SYN-ECON',
  seriesId:'ORIENTATION',title:'가상 학과 오리엔테이션',
  kind:'ORIENTATION',campus:'SEOUL',
  publishedAt:'2026-02-01T00:00:00Z',
  verifiedAt:'2026-02-02T00:00:00Z',
  eventDate:'2026-03-05',
  sourceUrl:'https://example.org/synthetic/events/syn-2026',
  status:'CONFIRMED',rights:'APPROVED',provenance:'SYNTHETIC',
};
function review(input:{
  row?:Partial<ActivityRecord>;org?:Partial<ActivityOrganization>;
  channel?:Partial<ActivityChannel>;asOf?:string;
}={}){
  return reviewSyntheticActivityIntake({
    raw:[{...record,...input.row}],
    organizations:[{...org,...input.org}],
    channels:[{...channel,...input.channel}],
    asOf:input.asOf??AS_OF,
  });
}
describe('#339 pre-NCP source/channel manual intake is synthetic-only and fail-closed',()=>{
  it('accepts an independently listed synthetic channel with exact organization scope',()=>{
    const r=review();
    expect(r.records).toHaveLength(1);
    expect(r.quarantined).toEqual([]);
    expect(r.acceptedCount).toBe(1);
  });
  it.each([
    ['missing channel binding',{channelId:undefined},'UNKNOWN_CHANNEL'],
    ['mismatched channel binding',{channelId:'SYN-NOT-REGISTERED'},'UNKNOWN_CHANNEL'],
    ['unknown organization',{organizationId:'SYN-OTHER'},'UNKNOWN_ORGANIZATION'],
    ['cross-campus event',{campus:'GLOBAL'},'SCOPE_MISMATCH'],
    ['cross-domain URL',{sourceUrl:'https://other.example.org/synthetic/events/a'},'URL_OUTSIDE_CHANNEL'],
    ['subdomain lookalike URL',{sourceUrl:'https://example.org.evil.invalid/synthetic/events/a'},'URL_OUTSIDE_CHANNEL'],
    ['path-prefix lookalike URL',{sourceUrl:'https://example.org/synthetic/events-evil/a'},'URL_OUTSIDE_CHANNEL'],
    ['URL credentials',{sourceUrl:'https://member@example.org/synthetic/events/a'},'URL_OUTSIDE_CHANNEL'],
    ['future publish',{publishedAt:'2026-07-01T00:00:00Z'},'RECORD_NOT_CURRENT'],
    ['future source verification',{verifiedAt:'2026-07-01T00:00:00Z'},'RECORD_NOT_CURRENT'],
    ['unsupported real production source',{provenance:'REAL_APPROVED'},'REAL_SOURCE_REQUIRES_OPERATOR'],
  ] as const)('quarantines %s without leaking rows',(_label,overrides,reason)=>{
    const r=review({row:overrides as Partial<ActivityRecord>});
    expect(r.records).toEqual([]);
    expect(r.quarantined[0]?.reason).toBe(reason);
    expect(r.acceptedCount).toBe(0);
  });
  it.each([
    ['revoked channel',{rights:'REVOKED' as const},'CHANNEL_NOT_CLEARED'],
    ['blocked channel',{rights:'BLOCKED' as const},'CHANNEL_NOT_CLEARED'],
    ['removed channel',{status:'REMOVED' as const},'CHANNEL_NOT_CLEARED'],
    ['not independently permitted as synthetic',{provenance:'REAL_APPROVED' as const},'CHANNEL_NOT_CLEARED'],
    ['cross-organization source',{organizationId:'SYN-OTHER'},'SCOPE_MISMATCH'],
    ['future channel verification',{verifiedAt:'2026-07-01T00:00:00Z'},'CHANNEL_OUT_OF_PERIOD'],
    ['future effective date',{effectiveFrom:'2026-07-01T00:00:00Z'},'CHANNEL_OUT_OF_PERIOD'],
    ['expired channel',{effectiveUntil:'2026-05-31T23:59:59Z'},'CHANNEL_OUT_OF_PERIOD'],
  ] as const)('quarantines %s',(_label,overrides,reason)=>{
    const r=review({channel:overrides as Partial<ActivityChannel>});
    expect(r.records).toEqual([]);
    expect(r.quarantined[0]?.reason).toBe(reason);
  });
  it('rejects an organization with a future review timestamp',()=>{
    expect(review({org:{verifiedAt:'2026-07-01T00:00:00Z'}}).quarantined[0]?.reason)
      .toBe('CHANNEL_OUT_OF_PERIOD');
  });
  it('quarantines duplicate channel IDs even if one copy has approved rights',()=>{
    const r=reviewSyntheticActivityIntake({
      raw:[record],organizations:[org],
      channels:[channel,{...channel,rights:'REVOKED'}],asOf:AS_OF,
    });
    expect(r.records).toHaveLength(0);
    expect(r.quarantined[0]?.reason).toBe('CONFLICTED_REGISTRY');
  });
  it('quarantines multiple organization records under the same stable ID',()=>{
    const r=reviewSyntheticActivityIntake({
      raw:[record],organizations:[org,{...org,displayName:'가상 기관 이름 변경'}],
      channels:[channel],asOf:AS_OF,
    });
    expect(r.records).toHaveLength(0);
    expect(r.quarantined[0]?.reason).toBe('CONFLICTED_REGISTRY');
  });
  it('does not silently map a retired ID from display aliases into the current organization',()=>{
    const r=review({row:{organizationId:'SYN-OLD-ORG'}});
    expect(r.quarantined[0]?.reason).toBe('UNKNOWN_ORGANIZATION');
  });
  it('keeps an approved channel tombstone so the old event cannot be resurrected',()=>{
    const tombstone:ActivityRecord={...record,revisionId:'SYN-REV-REVOKED',
      publishedAt:'2026-04-01T00:00:00Z',verifiedAt:'2026-04-02T00:00:00Z',
      rights:'REVOKED',status:'DELETED'};
    const result=reviewSyntheticActivityIntake({
      raw:[record,tombstone],organizations:[org],channels:[channel],asOf:AS_OF,
    });
    expect(result.records).toHaveLength(2);
    expect(currentActivityRecords(result.records,AS_OF)).toEqual([]);
  });
  it('rejects malformed records without echoing their raw contents',()=>{
    const r=reviewSyntheticActivityIntake({
      raw:[{...record,sourceUrl:'javascript:alert(1)',privateToken:'DO_NOT_LOG'}],
      organizations:[org],channels:[channel],asOf:AS_OF,
    });
    expect(r.records).toEqual([]);
    expect(r.quarantined).toEqual([{entryId:'UNVALIDATED',reason:'INVALID_RECORD'}]);
    expect(JSON.stringify(r)).not.toContain('DO_NOT_LOG');
  });
  it('never calls remote networks: this function only transforms prepared synthetic fixtures',()=>{
    const r=review();
    expect(r.records[0]?.sourceUrl).toBe(record.sourceUrl);
    expect(r.records[0]?.provenance).toBe('SYNTHETIC');
  });
});
