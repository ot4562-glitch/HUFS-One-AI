import {describe,expect,it} from 'vitest';
import type {ActivityRecord} from '@hufs-one/contracts';
import {archiveActivities,currentActivityRecords,forecastActivity} from './activities.js';
const ASOF='2026-02-01T00:00:00Z';
function row(y:number,month='03',day='07',extra:Partial<ActivityRecord>={}):ActivityRecord{
  return {
    entryId:'a'+y,sourceId:'source'+y,revisionId:'rev'+y,organizationId:'synthetic-dept',
    seriesId:'orientation',title:'가상 학과 오리엔테이션',kind:'ORIENTATION',
    campus:'SEOUL',publishedAt:(y+'-02-01T00:00:00Z'),verifiedAt:(y+'-02-02T00:00:00Z'),
    eventDate:y+'-'+month+'-'+day,sourceUrl:'https://example.org/synthetic/'+y,
    status:'CONFIRMED',rights:'APPROVED',provenance:'SYNTHETIC',...extra,
  };
}
describe('activity archive and past-only seasonal outlook (#339)',()=>{
  it('forecasts only a coarse window from 3 distinct prior years, not a probability or exact date',()=>{
    const rows=[row(2023),row(2024,'03','12'),row(2025,'03','09')];
    const result=forecastActivity(rows,ASOF,2026,'synthetic-dept','orientation');
    expect(result.state).toBe('PREDICTED');
    expect(result.confidence).toBe('MEDIUM');
    expect(result.observedYears).toEqual([2023,2024,2025]);
    expect(result.from).toBe('2026-02-28');
    expect(result.to).toBe('2026-03-19');
  });
  it('one observed year is insufficient; two years have low confidence',()=>{
    const a=row(2025),b=row(2024,'03','11');
    expect(forecastActivity([a],ASOF,2026,'synthetic-dept','orientation').state).toBe('INSUFFICIENT_DATA');
    expect(forecastActivity([a,b],ASOF,2026,'synthetic-dept','orientation').confidence).toBe('LOW');
  });
  it('diffuse annual timing is withheld',()=>{
    const r=forecastActivity([row(2023,'02','01'),row(2024,'05','01'),row(2025,'10','02')],
      ASOF,2026,'synthetic-dept','orientation');
    expect(r.state).toBe('UNKNOWN');
    expect(r.from).toBeUndefined();
  });
  it('future corrections never leak backwards; current confirmations take priority',()=>{
    const base=[row(2023),row(2024),row(2025)];
    const actual=row(2026,'04','12',{publishedAt:'2026-03-01T00:00:00Z',verifiedAt:'2026-03-01T00:00:00Z'});
    expect(forecastActivity([...base,actual],ASOF,2026,'synthetic-dept','orientation').state).toBe('PREDICTED');
    expect(forecastActivity([...base,actual],'2026-04-01T00:00:00Z',2026,'synthetic-dept','orientation').state).toBe('CONFIRMED');
  });
  it('known cancellation supersedes history, without pretending the event happened',()=>{
    const cancelled=row(2026,'03','08',{status:'CANCELLED',publishedAt:'2026-01-10T00:00:00Z',verifiedAt:'2026-01-11T00:00:00Z'});
    const r=forecastActivity([row(2023),row(2024),row(2025),cancelled],ASOF,2026,'synthetic-dept','orientation');
    expect(r.state).toBe('CANCELLED');
  });
  it('a revoked new head blocks prior approved source, but future revocation does not time travel',()=>{
    const old=row(2025);
    const revoked=row(2025,'03','07',{revisionId:'rev-revoked',rights:'REVOKED',
      publishedAt:'2026-01-05T00:00:00Z',verifiedAt:'2026-01-06T00:00:00Z'});
    expect(currentActivityRecords([old,revoked],ASOF)).toHaveLength(0);
    expect(currentActivityRecords([old,revoked],'2025-06-01T00:00:00Z')).toHaveLength(1);
  });
  it('deduplicates a shared annual event across reposts, and filters organization/year/campus',()=>{
    const a=row(2025);
    const b=row(2025,'03','07',{entryId:'repost',sourceId:'social',revisionId:'social-r1',
      publishedAt:'2025-02-10T00:00:00Z',verifiedAt:'2025-02-11T00:00:00Z'});
    expect(archiveActivities([a,b],ASOF)).toHaveLength(1);
    expect(archiveActivities([a,b],ASOF,{organizationId:'other'})).toHaveLength(0);
    expect(archiveActivities([a,b],ASOF,{year:2025,campus:'SEOUL',query:'오리엔테이션'})).toHaveLength(1);
  });
  it('does not treat a post date as a missing event date',()=>{
    const a=row(2025,'03','07',{eventDate:undefined});
    const result=forecastActivity([a],ASOF,2026,'synthetic-dept','orientation');
    expect(result.state).toBe('INSUFFICIENT_DATA');
  });
});
