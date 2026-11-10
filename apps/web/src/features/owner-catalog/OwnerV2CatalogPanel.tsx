import {useEffect,useRef,useState,useSyncExternalStore,type FormEvent} from 'react';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerSessionFailure} from '../../app/OwnerSessionFailure.js';

export interface OwnerV2CatalogPort {
  session:OwnerSessionController;
  search:HufsOwnerApiClient['searchApprovedV2Catalog'];
}
type SearchResult=Awaited<ReturnType<OwnerV2CatalogPort['search']>>;
type EligibilityFilter=''|'MET'|'NOT_MET'|'UNKNOWN';
type Sort='TITLE'|'DEADLINE_ASC'|'PUBLISHED_DESC';
type CatalogFilters={
  q:string;category:string;campus:string;eligibility:EligibilityFilter;
  deadlineDate:string;includeClosed:boolean;sort:Sort;
};

/** Keep all filters identical across first and cursor-continuation pages. */
export function buildCatalogSearchQuery(
  f:CatalogFilters,cursor?:string,asOf?:string,
):Parameters<OwnerV2CatalogPort['search']>[0]{
  return {
    q:f.q,sort:f.sort,pageSize:10,includeClosed:f.includeClosed,
    ...(f.category?{category:f.category}:{}),
    ...(f.campus?{campus:f.campus}:{}),
    ...(f.eligibility?{eligibility:f.eligibility}:{}),
    ...(f.deadlineDate?{deadlineBefore:f.deadlineDate+'T23:59:59.999+09:00'}:{}),
    ...(cursor&&asOf?{cursor,asOf}:{}),
  };
}


/** The URL is a source citation only; students must follow official instructions to apply. */
export function OwnerV2CatalogListItem({item}:{item:C.OpportunityCatalogItem}){
  const verified=item.permitted&&item.source.status==='VERIFIED'&&item.source.rights==='CLEARED';
  return <li>
    <strong>{item.title}</strong> · {item.category} · {item.campus??'캠퍼스 미확인'}
    {item.summary&&<p>{item.summary}</p>}
    <p className="muted">
      마감 {item.deadlineAt?.slice(0,10)??'미확인'} · 자격 {item.eligibility}
      {' · '}검증 판본 {item.source.revisionId}
      {verified&&item.source.verifiedAt&&<> · 검증 {item.source.verifiedAt.slice(0,10)}</>}
    </p>
    {item.sourceUrl&&verified&&
      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
        aria-label={item.title+' 원문 보기 (새 탭)'}>원문 확인</a>}
  </li>;
}

export function OwnerV2CatalogPanel({port}:{port:OwnerV2CatalogPort}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [draft,setDraft]=useState(''),[term,setTerm]=useState('');
  const [sort,setSort]=useState<Sort>('TITLE');
  const [category,setCategory]=useState('');
  const [campus,setCampus]=useState('');
  const [eligibility,setEligibility]=useState<EligibilityFilter>('');
  const [deadlineDate,setDeadlineDate]=useState('');
  const [includeClosed,setIncludeClosed]=useState(false);
  const [result,setResult]=useState<SearchResult|null>(null);
  const [busy,setBusy]=useState(false);
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{generation.current++;setResult(null);setBusy(false);},[scope.epoch,scope.status]);
  const clearResults=()=>{generation.current++;setBusy(false);setResult(null);};
  const filters=(q:string):CatalogFilters=>({
    q,sort,category,campus,eligibility,deadlineDate,includeClosed,
  });
  const search=async(cursor?:string,asOf?:string)=>{
    if(scope.status!=='READY'||busy)return;
    const ticket=++generation.current;
    setBusy(true);
    if(!cursor)setResult(null);
    try{
      const received=await port.session.runLatest('owner-v2-catalog',signal=>
        port.search(buildCatalogSearchQuery(filters(term),cursor,asOf),signal));
      if(received&&ticket===generation.current&&port.session.getState().status==='READY')setResult(received);
    }finally{if(ticket===generation.current)setBusy(false);}
  };
  const submit=(event:FormEvent)=>{
    event.preventDefault();setTerm(draft);
    // Use the same current form value, not the previous React state.
    if(scope.status!=='READY'||busy)return;
    const ticket=++generation.current;
    setBusy(true);setResult(null);
    void port.session.runLatest('owner-v2-catalog',signal=>
      port.search(buildCatalogSearchQuery(filters(draft)),signal))
      .then(received=>{if(received&&ticket===generation.current&&port.session.getState().status==='READY')setResult(received);})
      .finally(()=>{if(ticket===generation.current)setBusy(false);});
  };
  if(scope.status==='IDLE'||scope.status==='CHECKING')
    return <p role="status" aria-busy="true">BETA 본인 권한 확인 중입니다.</p>;
  if(scope.status!=='READY')return <OwnerSessionFailure controller={port.session}>
    현재 본인·출처 권한이 바뀌어 검색 페이지와 재사용 커서를 지웠습니다.
  </OwnerSessionFailure>;
  return <section className="section" aria-label="승인된 전체 공고 검색">
    <p role="note">학교 공식 모집 접수·합격 판정이 아닙니다. 현재 출처 권리와 공개 판본이 확인된 항목만 검색합니다. 결과 개수는 전체 인터넷이 아니라 현재 허가된 원장 범위입니다.</p>
    <form role="search" onSubmit={submit} className="club__filters">
      <label htmlFor="owner-v2-search">승인된 공고에서 검색</label>
      <input id="owner-v2-search" maxLength={100} value={draft}
        onChange={event=>{setDraft(event.target.value);clearResults();}}/>
      <label htmlFor="owner-v2-sort">정렬</label>
      <select id="owner-v2-sort" value={sort}
        onChange={event=>{setSort(event.target.value as Sort);clearResults();}}>
        <option value="TITLE">이름순</option><option value="DEADLINE_ASC">마감 임박순</option>
        <option value="PUBLISHED_DESC">게시 최신순</option>
      </select>
      <label htmlFor="owner-v2-category">공고 유형</label>
      <select id="owner-v2-category" value={category}
        onChange={e=>{setCategory(e.target.value);clearResults();}}>
        <option value="">모든 유형</option>
        <option value="SCHOLARSHIP">장학금</option>
        <option value="CONTEST">공모전</option>
        <option value="INTERNSHIP">인턴십</option>
        <option value="JOB">채용</option>
        <option value="EXTRACURRICULAR">비교과</option>
      </select>
      <label htmlFor="owner-v2-campus">캠퍼스</label>
      <select id="owner-v2-campus" value={campus}
        onChange={e=>{setCampus(e.target.value);clearResults();}}>
        <option value="">모든 캠퍼스</option>
        <option value="SEOUL">서울</option>
        <option value="GLOBAL">글로벌</option>
      </select>
      <label htmlFor="owner-v2-eligibility">지원 자격 판정</label>
      <select id="owner-v2-eligibility" value={eligibility}
        onChange={e=>{setEligibility(e.target.value as EligibilityFilter);clearResults();}}>
        <option value="">모든 자격</option>
        <option value="MET">요건 충족</option>
        <option value="NOT_MET">요건 미충족</option>
        <option value="UNKNOWN">검증 필요</option>
      </select>
      <label htmlFor="owner-v2-deadline">마감일 이전 (한국 시간)</label>
      <input id="owner-v2-deadline" type="date" value={deadlineDate}
        onChange={e=>{setDeadlineDate(e.target.value);clearResults();}}/>
      <label htmlFor="owner-v2-closed">
        <input id="owner-v2-closed" type="checkbox" checked={includeClosed}
          onChange={e=>{setIncludeClosed(e.target.checked);clearResults();}}/>
        마감된 공고 포함
      </label>
      <button type="submit" disabled={busy}>{busy?'조회 중':'검색'}</button>
    </form>
    {result?.state==='NOT_CONNECTED'&&<p role="status">NOT_CONNECTED — 현재 권한 검증된 공고 데이터와 서명 커서가 운영 서버에 설정되지 않았습니다. 합성/추정 결과로 대체하지 않습니다.</p>}
    {result?.state==='READY'&&<section aria-live="polite">
      <p className="muted">승인된 검색 범위 {result.page.totalInAuthorizedScope}건 · 조회 판본 {result.sourceVersion} · 기준 {result.page.at.slice(0,10)}</p>
      {result.page.items.length===0?<p>현재 검색조건과 승인된 출처에 맞는 공고가 없습니다.</p>:
        <ul>{result.page.items.map(item=><OwnerV2CatalogListItem key={item.id} item={item}/>)}</ul>}
      {result.page.nextCursor&&<button disabled={busy} onClick={()=>void search(result.page.nextCursor!,result.page.at)}>
        {busy?'권한 확인 중':'다음 승인 페이지'}
      </button>}
    </section>}
  </section>;
}
