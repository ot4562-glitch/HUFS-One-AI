import {useEffect,useRef,useState,useSyncExternalStore,type FormEvent} from 'react';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {OwnerSessionFailure} from '../../app/OwnerSessionFailure.js';

export interface OwnerV2CatalogPort {
  session:OwnerSessionController;
  search:HufsOwnerApiClient['searchApprovedV2Catalog'];
}
/** An ISO offset can belong to the next calendar day in Asia/Seoul. */
const KST_DATE=new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
});
export function formatKstDate(value?:string):string{
  if(!value)return '미확인';
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '미확인';
  const parts=KST_DATE.formatToParts(date);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value;
  const year=part('year'),month=part('month'),day=part('day');
  return year&&month&&day?`${year}-${month}-${day}`:'미확인';
}

type SearchResult=Awaited<ReturnType<OwnerV2CatalogPort['search']>>;
type RecoverableCatalogError='EXPIRED_SNAPSHOT'|'RATE_LIMITED'|'INVALID_FILTER';
type CatalogLookup={kind:'RESULT';value:SearchResult}
  |{kind:'RECOVERABLE';reason:RecoverableCatalogError};
/** A failed catalog page is not necessarily a failed owner session. Preserve the
 * authenticated session for expired signed cursors or exhausted read quota.
 * Other errors (especially 401/403) must reach the fail-closed session controller. */
function recoverableCatalogError(error:unknown,continuation:boolean):RecoverableCatalogError|null{
  if(!(error instanceof HufsApiError))return null;
  if(error.status===409&&error.code==='VERSION_CONFLICT')return 'EXPIRED_SNAPSHOT';
  if(error.status===422&&error.code==='INVALID_INPUT')
    return continuation?'EXPIRED_SNAPSHOT':'INVALID_FILTER';
  if(error.status===429&&error.code==='RATE_LIMITED')return 'RATE_LIMITED';
  return null;
}
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
      마감 {formatKstDate(item.deadlineAt)} · 자격 {item.eligibility}
      {' · '}검증 판본 {item.source.revisionId}
      {verified&&item.source.verifiedAt&&<> · 검증 {formatKstDate(item.source.verifiedAt)}</>}
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
  const [notice,setNotice]=useState<RecoverableCatalogError|null>(null);
  const [busy,setBusy]=useState(false);
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{generation.current++;setResult(null);setNotice(null);setBusy(false);},[scope.epoch,scope.status]);
  const clearResults=()=>{generation.current++;setBusy(false);setResult(null);setNotice(null);};
  const filters=(q:string):CatalogFilters=>({
    q,sort,category,campus,eligibility,deadlineDate,includeClosed,
  });
  const search=async(cursor?:string,asOf?:string)=>{
    if(scope.status!=='READY'||busy)return;
    const ticket=++generation.current;
    const continuation=Boolean(cursor&&asOf);
    const query=buildCatalogSearchQuery(filters(continuation?term:draft),cursor,asOf);
    if(!continuation)setTerm(draft);
    setBusy(true);setNotice(null);
    if(!continuation)setResult(null);
    try{
      const received=await port.session.runLatest<CatalogLookup>(
        'owner-v2-catalog',async signal=>{
          try{return {kind:'RESULT',value:await port.search(query,signal)};}
          catch(error){
            const reason=recoverableCatalogError(error,continuation);
            if(reason)return {kind:'RECOVERABLE',reason};
            throw error; // 401/403 and unexpected failures remain fail-closed
          }
        });
      if(!received||ticket!==generation.current||port.session.getState().status!=='READY')return;
      if(received.kind==='RESULT')setResult(received.value);
      else{
        // Never leave a stale signed cursor or private page visible after rejection.
        setResult(null);setNotice(received.reason);
      }
    }finally{if(ticket===generation.current)setBusy(false);}
  };
  const submit=(event:FormEvent)=>{
    event.preventDefault();
    // A first-page search intentionally omits all prior cursor/asOf state.
    void search();
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
    {notice==='EXPIRED_SNAPSHOT'&&<div role="status">
      <p>승인 출처 판본 또는 검색 기준 시점이 변경되었거나 서명 커서가 만료됐습니다. 계정 권한은 유지됩니다. 첫 페이지부터 새 기준으로 조회하세요.</p>
      <button type="button" disabled={busy} onClick={()=>void search()}>첫 페이지 새로 검색</button>
    </div>}
    {notice==='RATE_LIMITED'&&<p role="status">요청 한도를 초과했습니다. 잠시 후 검색을 직접 다시 시도하세요. 자동으로 반복 요청하지 않습니다.</p>}
    {notice==='INVALID_FILTER'&&<p role="status">검색 조건을 확인할 수 없습니다. 필터를 수정한 뒤 새로 검색하세요.</p>}
    {result?.state==='NOT_CONNECTED'&&<p role="status">NOT_CONNECTED — 현재 권한 검증된 공고 데이터와 서명 커서가 운영 서버에 설정되지 않았습니다. 합성/추정 결과로 대체하지 않습니다.</p>}
    {result?.state==='READY'&&<section aria-live="polite">
      <p className="muted">승인된 검색 범위 {result.page.totalInAuthorizedScope}건 · 조회 판본 {result.sourceVersion} · 기준 {formatKstDate(result.page.at)}</p>
      {result.page.items.length===0?<p>현재 검색조건과 승인된 출처에 맞는 공고가 없습니다.</p>:
        <ul>{result.page.items.map(item=><OwnerV2CatalogListItem key={item.id} item={item}/>)}</ul>}
      {result.page.nextCursor&&<button disabled={busy} onClick={()=>void search(result.page.nextCursor!,result.page.at)}>
        {busy?'권한 확인 중':'다음 승인 페이지'}
      </button>}
    </section>}
  </section>;
}
