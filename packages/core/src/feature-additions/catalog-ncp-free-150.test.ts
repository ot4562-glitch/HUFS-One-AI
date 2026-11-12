import {describe,expect,it} from 'vitest';
import {searchApprovedCatalogV2} from './catalog-v2.js';
import {opportunity,query,source} from './v2.fixtures.js';
const SCOPE={scopeKey:'SYN-OWNER-A-CONSENT-1',catalogRevision:'SYN-HEAD-V1'};
const records=Array.from({length:205},(_,i)=>opportunity(
  'SYN-ITEM-'+String(i).padStart(4,'0'),{
    title:i===150?'희귀 우주 연구 인턴':'합성 일반 경제 활동',
    summary:'허구 자료만 사용한 오프라인 검색 결과',
    publishedAt:'2026-10-01T00:00:00Z',
    deadlineAt:'2026-12-31T23:59:00Z',
  }));
const read=(q:ReturnType<typeof query>,cursor?:ReturnType<typeof searchApprovedCatalogV2>['nextCursor'])=>
  searchApprovedCatalogV2({items:records,query:q,...SCOPE,...(cursor?{cursor}:{})});
describe('#348 NCP-free complete permitted catalog scan, not browser-visible first page',()=>{
  it('finds the 151st approved item even if preceding 150 do not match',()=>{
    const response=read(query({q:'우주',pageSize:20,sort:'TITLE'}));
    expect(response.items.map(x=>x.id)).toEqual(['SYN-ITEM-0150']);
    expect(response.totalInAuthorizedScope).toBe(1);
    expect(response.scope).toBe('PERMITTED_APPROVED_SNAPSHOT');
  });
  it.each([1,7,20,30,50])('pages 205 authorized items with pageSize %s exactly once',size=>{
    const ids:string[]=[];let cursor:ReturnType<typeof read>['nextCursor']=null;
    for(let step=0;step<206;step++){
      const result=read(query({pageSize:size,sort:'DEADLINE_ASC'}),cursor);
      ids.push(...result.items.map(x=>x.id));
      if(!result.hasMore){expect(result.nextCursor).toBeNull();break;}
      expect(result.nextCursor).not.toBeNull();
      cursor=result.nextCursor;
    }
    expect(ids).toHaveLength(205);
    expect(new Set(ids).size).toBe(205);
  });
  it('rejects a cursor from another owner, revised head or changed filter',()=>{
    const first=read(query({pageSize:20,sort:'TITLE'}));
    const cursor=first.nextCursor!;
    const cases=[
      {scopeKey:'SYN-OWNER-B-CONSENT-2',catalogRevision:SCOPE.catalogRevision},
      {scopeKey:SCOPE.scopeKey,catalogRevision:'SYN-HEAD-V2'},
    ];
    for(const item of cases)expect(()=>searchApprovedCatalogV2({items:records,
      query:query({pageSize:20,sort:'TITLE'}),...item,cursor})).toThrow('STALE_CURSOR');
    expect(()=>read(query({pageSize:20,sort:'DEADLINE_ASC'}),cursor)).toThrow('STALE_CURSOR');
    expect(()=>read(query({pageSize:20,sort:'TITLE',q:'희귀'}),cursor)).toThrow('STALE_CURSOR');
  });
  it('removes ALL duplicate source heads rather than selecting a convenient one',()=>{
    const duplicate=records[0]!,overrides=[...records,opportunity(duplicate.id,{
      title:'허위 재발행 충돌',source:{...source(),status:'REVOKED'},
    })];
    const result=searchApprovedCatalogV2({items:overrides,
      query:query({pageSize:20}),...SCOPE});
    expect(result.totalInAuthorizedScope).toBe(204);
    expect(result.items.map(x=>x.id)).not.toContain(duplicate.id);
  });
  it('never leaks unreviewed/future/expired rows into the default actionable count',()=>{
    const items=[
      opportunity('open',{deadlineAt:'2026-12-01T00:00:00Z'}),
      opportunity('expired',{deadlineAt:'2026-01-01T00:00:00Z'}),
      opportunity('future',{publishedAt:'2028-01-01T00:00:00Z'}),
      opportunity('unlicensed',{source:{...source(),rights:'BLOCKED'}}),
      opportunity('private',{permitted:false}),
    ];
    const response=searchApprovedCatalogV2({items,
      query:query({pageSize:20}),...SCOPE});
    expect(response.items.map(x=>x.id)).toEqual(['open']);
    expect(response.totalInAuthorizedScope).toBe(1);
  });
});
