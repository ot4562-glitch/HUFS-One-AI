import {describe,expect,it} from 'vitest';
import type {ActivityRecord} from '@hufs-one/contracts';
import {archiveActivities,currentActivityRecords,forecastActivity} from './activities.js';

const AS_OF='2027-01-02T00:00:00Z';
function record(id:string,publishedAt:string,extra:Partial<ActivityRecord>={}):ActivityRecord{
  return {
    entryId:id,sourceId:'SYN-SOURCE-'+id,revisionId:'SYN-REV-'+id,
    organizationId:'SYN-DEPT',seriesId:'SYN-ANNUAL',
    title:'가상 학과 연례 안내',kind:'OTHER',campus:'SEOUL',
    publishedAt,verifiedAt:publishedAt,
    sourceUrl:'https://example.org/activities/'+id,status:'ANNOUNCED',
    rights:'APPROVED',provenance:'SYNTHETIC',...extra,
  };
}

describe('#339 undated archive notices use Asia/Seoul year without inventing an event date',()=>{
  const dec=record('BEFORE','2026-12-31T14:59:59Z');
  const jan=record('AFTER','2026-12-31T15:00:00Z');
  const later=record('LATER','2027-01-01T01:00:00Z');
  it('distinguishes 2026-12-31 23:59 KST from 2027-01-01 00:00 KST',()=>{
    const records=currentActivityRecords([dec,jan],AS_OF);
    expect(records.map(r=>r.entryId).sort()).toEqual(['AFTER','BEFORE']);
    expect(records.every(r=>r.eventDate===undefined)).toBe(true);
    expect(archiveActivities([dec,jan],AS_OF,{year:2026}).map(r=>r.entryId)).toEqual(['BEFORE']);
    expect(archiveActivities([dec,jan],AS_OF,{year:2027}).map(r=>r.entryId)).toEqual(['AFTER']);
  });
  it('deduplicates the two Jan 1 KST announcements, choosing the newer approved source',()=>{
    for(const source of [[dec,jan,later],[later,jan,dec]]){
      const records=archiveActivities(source,AS_OF);
      expect(records.map(r=>r.entryId).sort()).toEqual(['BEFORE','LATER']);
      expect(records.every(r=>r.eventDate===undefined)).toBe(true);
    }
  });
  it('an explicit eventDate wins over the posting date when computing archive year',()=>{
    const dated=record('DATED','2026-12-31T15:00:00Z',{eventDate:'2026-04-01'});
    expect(archiveActivities([dated],AS_OF,{year:2026})).toHaveLength(1);
    expect(archiveActivities([dated],AS_OF,{year:2027})).toHaveLength(0);
    expect(archiveActivities([dated],AS_OF)[0]?.eventDate).toBe('2026-04-01');
  });
  it('does not let a 2027 KST undated cancellation suppress the 2026 outlook',()=>{
    const held=[
      record('H24','2024-01-15T00:00:00Z',{eventDate:'2024-03-08',status:'CONFIRMED'}),
      record('H25','2025-01-15T00:00:00Z',{eventDate:'2025-03-10',status:'CONFIRMED'}),
    ];
    const cancelled=record('CANCEL','2026-12-31T15:00:00Z',
      {verifiedAt:'2026-12-31T15:01:00Z',status:'CANCELLED'});
    const result2026=forecastActivity([...held,cancelled],AS_OF,2026,'SYN-DEPT','SYN-ANNUAL');
    expect(result2026.state).toBe('PREDICTED');
    expect(result2026.observedYears).toEqual([2024,2025]);
    const result2027=forecastActivity([...held,cancelled],AS_OF,2027,'SYN-DEPT','SYN-ANNUAL');
    expect(result2027.state).toBe('UNKNOWN');
    expect(result2027.evidenceRefs).toContain('SYN-REV-CANCEL');
    expect(result2027.from).toBeUndefined();
  });
  it('treats equivalent UTC and +09:00 publication instants identically',()=>{
    const dateZ=record('Z','2026-12-31T15:00:00Z');
    const dateK=record('K','2027-01-01T00:00:00+09:00');
    expect(archiveActivities([dateZ],AS_OF,{year:2027})).toHaveLength(1);
    expect(archiveActivities([dateK],AS_OF,{year:2027})).toHaveLength(1);
    expect(archiveActivities([dateZ],AS_OF,{year:2026})).toHaveLength(0);
    expect(archiveActivities([dateK],AS_OF,{year:2026})).toHaveLength(0);
  });
});
