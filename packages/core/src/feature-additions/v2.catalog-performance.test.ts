import {describe,expect,it} from 'vitest';
import {performance} from 'node:perf_hooks';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {catalogFilterKey,searchApprovedCatalogV2} from './catalog-v2.js';
import {opportunity,query} from './v2.fixtures.js';

const scope={scopeKey:'synthetic-actor-scope-v1',catalogRevision:'synthetic-revision-1'};
const normalized=(text:string)=>text.normalize('NFKC').trim().toLocaleLowerCase('ko');
const bySort=(sort:C.OpportunityQuery['sort'])=>
  (a:C.OpportunityCatalogItem,b:C.OpportunityCatalogItem)=>{
    if(sort==='TITLE')return normalized(a.title).localeCompare(normalized(b.title),'ko')
      ||a.id.localeCompare(b.id,'en');
    if(sort==='DEADLINE_ASC'){
      const x=a.deadlineAt?Date.parse(a.deadlineAt):Infinity;
      const y=b.deadlineAt?Date.parse(b.deadlineAt):Infinity;
      return x-y||a.id.localeCompare(b.id,'en');
    }
    const x=a.publishedAt?Date.parse(a.publishedAt):-Infinity;
    const y=b.publishedAt?Date.parse(b.publishedAt):-Infinity;
    return y-x||a.id.localeCompare(b.id,'en');
  };
const all=Array.from({length:25000},(_,i)=>opportunity('SYN-'+String(i).padStart(6,'0'),{
  title:i%31===0?'가상 데이터 연구':i%5===0?'Synthetic internship':'Economics mentoring',
  category:i%3===0?'SCHOLARSHIP':'INTERNSHIP',
  campus:i%7===0?'GLOBAL':'SEOUL',
  deadlineAt:i%11===0?undefined:'2026-12-'+String((i%20)+1).padStart(2,'0')+'T23:59:00+09:00',
  publishedAt:'2026-11-'+String((i%6)+1).padStart(2,'0')+'T00:00:00+09:00',
  permitted:i%97!==0,
}));
function reference(items:readonly C.OpportunityCatalogItem[],q:C.OpportunityQuery){
  const t=Date.parse(q.asOf);
  const tokens=normalized(q.q??'').split(/\s+/u).filter(Boolean);
  return items.filter(row=>row.permitted
    &&row.source.status==='VERIFIED'&&row.source.rights==='CLEARED'
    &&Date.parse(row.source.effectiveFrom)<=t
    &&(!row.source.effectiveUntil||Date.parse(row.source.effectiveUntil)>t)
    &&(!row.publishedAt||Date.parse(row.publishedAt)<=t)
    &&(q.includeClosed||!row.deadlineAt||Date.parse(row.deadlineAt)>t)
    &&(!q.category||row.category===q.category)
    &&(!q.campus||row.campus===q.campus)
    &&(!q.eligibility||row.eligibility===q.eligibility)
    &&(!q.deadlineBefore||!!row.deadlineAt
      &&Date.parse(row.deadlineAt)<=Date.parse(q.deadlineBefore))
    &&tokens.every(token=>normalized([row.title,row.summary,...row.topicCodes].join(' ')).includes(token))
  ).sort(bySort(q.sort));
}
describe('#447 bounded 25,000-row V2 catalog top-k and keyset equivalence',()=>{
  for(const sort of ['TITLE','DEADLINE_ASC','PUBLISHED_DESC'] as const){
    it('preserves full-sort ordering and cursor continuity for '+sort,()=>{
      const q=query({sort,pageSize:50});
      const baseline=reference(all,q);
      const t=performance.now();
      const first=searchApprovedCatalogV2({items:all,query:q,...scope});
      const second=searchApprovedCatalogV2({
        items:all,query:q,...scope,cursor:first.nextCursor!,
      });
      const third=searchApprovedCatalogV2({
        items:all,query:q,...scope,cursor:second.nextCursor!,
      });
      const elapsedMs=performance.now()-t;
      expect(first.items.map(x=>x.id)).toEqual(baseline.slice(0,50).map(x=>x.id));
      expect(second.items.map(x=>x.id)).toEqual(baseline.slice(50,100).map(x=>x.id));
      expect(third.items.map(x=>x.id)).toEqual(baseline.slice(100,150).map(x=>x.id));
      expect(first.totalInAuthorizedScope).toBe(baseline.length);
      expect(second.totalInAuthorizedScope).toBe(baseline.length);
      expect(third.nextCursor!.filterKey).toBe(catalogFilterKey(q));
      if(process.env.HUFS_CATALOG_BENCHMARK==='1')
        console.info(JSON.stringify({sort,rows:all.length,pages:3,pageSize:q.pageSize,
          elapsedMs:Math.round(elapsedMs*10)/10}));
    });
  }
  it('keeps filtered, duplicate-ambiguous and source-revoked entries excluded',()=>{
    const q=query({sort:'TITLE',q:'economics',category:'INTERNSHIP',
      campus:'SEOUL',pageSize:30,deadlineBefore:'2026-12-15T23:59:59+09:00'});
    const baseline=reference(all,q);
    const first=searchApprovedCatalogV2({items:all,query:q,...scope});
    expect(first.items.map(x=>x.id)).toEqual(baseline.slice(0,30).map(x=>x.id));
    expect(first.totalInAuthorizedScope).toBe(baseline.length);
    const duplicate=opportunity('SYN-DUP');
    const result=searchApprovedCatalogV2({
      items:[...all,duplicate,duplicate],query:query(),...scope,
    });
    expect(result.items.some(x=>x.id==='SYN-DUP')).toBe(false);
    expect(result.totalInAuthorizedScope).toBe(reference(all,query()).length);
  });
  it('denies deleted, modified or cross-source cursor records',()=>{
    const q=query({sort:'PUBLISHED_DESC',pageSize:10});
    const first=searchApprovedCatalogV2({items:all,query:q,...scope});
    expect(first.nextCursor).not.toBeNull();
    const anchor=first.nextCursor!.lastId;
    expect(()=>searchApprovedCatalogV2({items:all.filter(x=>x.id!==anchor),
      query:q,...scope,cursor:first.nextCursor!})).toThrow('STALE_CURSOR');
    expect(()=>searchApprovedCatalogV2({items:all,query:q,...scope,
      cursor:{...first.nextCursor!,lastSortValue:'tampered'}})).toThrow('STALE_CURSOR');
    expect(()=>searchApprovedCatalogV2({items:all,query:q,...scope,
      catalogRevision:'different-revision',cursor:first.nextCursor!})).toThrow('STALE_CURSOR');
  });
});
