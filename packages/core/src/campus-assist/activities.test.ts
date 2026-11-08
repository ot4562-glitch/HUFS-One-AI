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
    const a=row(2025); delete a.eventDate;
    const result=forecastActivity([a],ASOF,2026,'synthetic-dept','orientation');
    expect(result.state).toBe('INSUFFICIENT_DATA');
  });
});

describe('#370 seasonal window uses the target year calendar',()=>{
  const AFTER='2027-06-01T00:00:00Z';
  const march1=[row(2025,'03','01'),row(2026,'03','01')];
  it('a leap target year keeps March 1 as March 1 (window ±7 days in that calendar)',()=>{
    const r=forecastActivity(march1,AFTER,2028,'synthetic-dept','orientation');
    expect(r.state).toBe('PREDICTED');
    expect(r.from).toBe('2028-02-23');
    expect(r.to).toBe('2028-03-08');
  });
  it('a common target year is unchanged',()=>{
    const r=forecastActivity(march1,AFTER,2027,'synthetic-dept','orientation');
    expect(r.from).toBe('2027-02-22');
    expect(r.to).toBe('2027-03-08');
  });
  it('February 28 history in a leap target year spans February 29',()=>{
    const r=forecastActivity([row(2025,'02','28'),row(2026,'02','28')],AFTER,2028,
      'synthetic-dept','orientation');
    expect(r.from).toBe('2028-02-21');
    expect(r.to).toBe('2028-03-06');
  });
  it('late-December history clamps to December 31 even in a leap year',()=>{
    const dec=[row(2025,'12','28'),row(2026,'12','29')];
    const late='2027-01-15T00:00:00Z';
    expect(forecastActivity(dec,late,2028,'synthetic-dept','orientation').to).toBe('2028-12-31');
    expect(forecastActivity(dec,late,2027,'synthetic-dept','orientation').to).toBe('2027-12-31');
  });
  it('early-January history clamps to January 1',()=>{
    const jan=[row(2025,'01','02'),row(2026,'01','03')];
    const r=forecastActivity(jan,'2026-06-01T00:00:00Z',2028,'synthetic-dept','orientation');
    expect(r.from).toBe('2028-01-01');
    expect(r.to).toBe('2028-01-10');
  });
});

describe('#371 a cancellation without an exact event date is not ignored',()=>{
  const AS_OF='2027-02-15T00:00:00Z';
  const history=[row(2025),row(2026)];
  const undated=(extra:Partial<ActivityRecord>={})=>{
    const c=row(2027,'03','07',{entryId:'cancel-2027',sourceId:'cancel',revisionId:'cancel-r1',
      status:'CANCELLED',publishedAt:'2027-02-01T00:00:00Z',verifiedAt:'2027-02-02T00:00:00Z',...extra});
    delete c.eventDate;
    return c;
  };
  it('withholds the target-year window instead of predicting over the cancellation',()=>{
    const r=forecastActivity([...history,undated()],AS_OF,2027,'synthetic-dept','orientation');
    expect(r.state).toBe('UNKNOWN');
    expect(r.from).toBeUndefined();
    expect(r.evidenceRefs[0]).toBe('cancel-r1');
  });
  it('the same history without the cancellation still predicts (control)',()=>{
    expect(forecastActivity(history,AS_OF,2027,'synthetic-dept','orientation').state).toBe('PREDICTED');
  });
  it('a cancellation that supersedes a dated target-year announcement is CANCELLED',()=>{
    const announced=row(2027,'03','09',{entryId:'ann-2027',sourceId:'announce',revisionId:'ann-r1',
      status:'ANNOUNCED',publishedAt:'2027-01-10T00:00:00Z',verifiedAt:'2027-01-11T00:00:00Z'});
    const r=forecastActivity([...history,announced,undated({supersedes:'ann-r1'})],AS_OF,2027,
      'synthetic-dept','orientation');
    expect(r.state).toBe('CANCELLED');
    expect(r.from).toBeUndefined();
  });
  it('a cancellation that supersedes another year does not block this year',()=>{
    const old=row(2024,'03','07',{entryId:'old-2024',sourceId:'old',revisionId:'old-r1'});
    const late=undated({supersedes:'old-r1',publishedAt:'2026-12-01T00:00:00Z',verifiedAt:'2026-12-02T00:00:00Z'});
    const r=forecastActivity([old,...history,late],AS_OF,2027,'synthetic-dept','orientation');
    expect(r.state).toBe('PREDICTED');
  });
  it('an old undated cancellation followed by a held edition no longer blocks',()=>{
    // Published in 2024 (its own archive year), before the 2025 and 2026 editions were held.
    const early=undated({publishedAt:'2024-12-05T00:00:00Z',verifiedAt:'2024-12-06T00:00:00Z'});
    const r=forecastActivity([early,...history],AS_OF,2027,'synthetic-dept','orientation');
    expect(r.state).toBe('PREDICTED');
  });
  it('supersedes cannot resolve through a record published after asOf',()=>{
    const later=row(2027,'03','09',{entryId:'ann-2027',sourceId:'announce',revisionId:'ann-r1',
      status:'ANNOUNCED',publishedAt:'2027-03-01T00:00:00Z',verifiedAt:'2027-03-02T00:00:00Z'});
    const r=forecastActivity([...history,later,undated({supersedes:'ann-r1'})],AS_OF,2027,
      'synthetic-dept','orientation');
    expect(r.state).toBe('UNKNOWN');
  });
  it('a cancellation published after asOf does not time travel',()=>{
    const future=undated({publishedAt:'2027-03-01T00:00:00Z',verifiedAt:'2027-03-02T00:00:00Z'});
    expect(forecastActivity([...history,future],AS_OF,2027,'synthetic-dept','orientation').state)
      .toBe('PREDICTED');
  });
});

describe('#371 review follow-up: cancellation before a dated confirmation, trusted links only',()=>{
  const AS_OF='2027-02-15T00:00:00Z';
  const history=[row(2025),row(2026)];
  const confirmed2027=row(2027,'03','09',{entryId:'conf-2027',sourceId:'announce',revisionId:'conf-r1',
    publishedAt:'2026-10-01T00:00:00Z',verifiedAt:'2026-10-02T00:00:00Z'});
  const cancel=(extra:Partial<ActivityRecord>={})=>{
    const c=row(2026,'12','01',{entryId:'cancel',sourceId:'cancel',revisionId:'cancel-r1',status:'CANCELLED',
      publishedAt:'2026-12-01T00:00:00Z',verifiedAt:'2026-12-02T00:00:00Z',...extra});
    delete c.eventDate;
    return c;
  };
  it('review case 1: 2027 confirmation posted 2026-10, undated cancellation of it posted 2026-12 -> CANCELLED',()=>{
    const r=forecastActivity([...history,confirmed2027,cancel({supersedes:'conf-r1'})],AS_OF,2027,
      'synthetic-dept','orientation');
    expect(r.state).toBe('CANCELLED');
    expect(r.evidenceRefs[0]).toBe('cancel-r1');
  });
  it('the same cancellation without a link still withholds instead of CONFIRMED',()=>{
    expect(forecastActivity([...history,confirmed2027,cancel()],AS_OF,2027,'synthetic-dept','orientation').state)
      .toBe('UNKNOWN');
  });
  it('a dated confirmation published after the cancellation wins (event re-confirmed)',()=>{
    const later={...confirmed2027,revisionId:'conf-r2',publishedAt:'2027-01-10T00:00:00Z',verifiedAt:'2027-01-11T00:00:00Z'};
    expect(forecastActivity([...history,later,cancel()],AS_OF,2027,'synthetic-dept','orientation').state)
      .toBe('CONFIRMED');
  });
  describe('review case 2: an untrusted supersedes target never lets the cancellation be skipped',()=>{
    const other=(extra:Partial<ActivityRecord>)=>row(2024,'03','07',{entryId:'old-2024',sourceId:'old',
      revisionId:'old-r1',...extra});
    const late=cancel({supersedes:'old-r1',publishedAt:'2027-02-01T00:00:00Z',verifiedAt:'2027-02-02T00:00:00Z'});
    it.each([
      ['not yet verified at asOf',other({verifiedAt:'2027-03-01T00:00:00Z'})],
      ['revoked',other({rights:'REVOKED'})],
      ['blocked',other({rights:'BLOCKED'})],
    ])('%s -> UNKNOWN',(_label,target)=>{
      expect(forecastActivity([target,...history,late],AS_OF,2027,'synthetic-dept','orientation').state)
        .toBe('UNKNOWN');
    });
    it('superseded by a newer head of the same source -> UNKNOWN',()=>{
      const newerHead=other({revisionId:'old-r2',eventDate:'2024-03-09',publishedAt:'2024-02-10T00:00:00Z',
        verifiedAt:'2024-02-11T00:00:00Z'});
      expect(forecastActivity([other({}),newerHead,...history,late],AS_OF,2027,'synthetic-dept','orientation').state)
        .toBe('UNKNOWN');
    });
    it('control: a trusted link to another year is ignored -> PREDICTED',()=>{
      expect(forecastActivity([other({}),...history,late],AS_OF,2027,'synthetic-dept','orientation').state)
        .toBe('PREDICTED');
    });
  });
});
