import {useEffect,useState,useSyncExternalStore,type FormEvent} from 'react';
import type {CourseCatalogPage,OpportunityCatalogPage,CourseOfferingsPage,OpportunityCatalogDetail} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import type {CatalogQuery,OfferingQuery} from '../../integrations/owner-api-client.js';

export interface OwnerCatalogPort {
  readonly session:OwnerSessionController;
  courses(query:CatalogQuery,signal?:AbortSignal):Promise<CourseCatalogPage>;
  opportunities(query:CatalogQuery,signal?:AbortSignal):Promise<OpportunityCatalogPage>;
  offerings(id:string,query:OfferingQuery,signal?:AbortSignal):Promise<CourseOfferingsPage>;
  detail(id:string,signal?:AbortSignal):Promise<OpportunityCatalogDetail>;
}

/** BETA identity-bound approved source browsing; no public feed fallback. */
export function OwnerCatalogPanel({port}:{port:OwnerCatalogPort}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [text,setText]=useState('');
  const [selectedQuery,setSelectedQuery]=useState<string|undefined>(undefined);
  const [courses,setCourses]=useState<CourseCatalogPage|null>(null);
  const [opportunities,setOpportunities]=useState<OpportunityCatalogPage|null>(null);
  const [offerings,setOfferings]=useState<CourseOfferingsPage|null>(null);
  const [detail,setDetail]=useState<OpportunityCatalogDetail|null>(null);
  const [busy,setBusy]=useState(false);
  const [inputError,setInputError]=useState('');
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{
    setCourses(null);setOpportunities(null);setOfferings(null);setDetail(null);
    setSelectedQuery(undefined);setText('');setInputError('');
    if(scope.status!=='READY')return;
    let active=true;
    void Promise.all([
      port.session.runLatest('catalog-courses',signal=>port.courses({limit:20},signal)),
      port.session.runLatest('catalog-opportunities',signal=>port.opportunities({limit:20},signal)),
    ]).then(([c,o])=>{if(active&&port.session.getState().status==='READY'){
      if(c)setCourses(c);if(o)setOpportunities(o);
    }});
    return()=>{active=false;};
  },[port,scope.epoch,scope.status]);

  const search=async(event:FormEvent)=>{
    event.preventDefault();
    if(busy||scope.status!=='READY')return;
    const q=text.trim();
    if(q.length===1||q.length>100){setInputError('검색어는 비우거나 2~100자로 입력하세요.');return;}
    setSelectedQuery(q||undefined);setInputError('');setBusy(true);
    setCourses(null);setOpportunities(null);setOfferings(null);setDetail(null);
    try{
      const [c,o]=await Promise.all([
        port.session.runLatest('catalog-courses',s=>port.courses({limit:20,...(q?{q}:{})},s)),
        port.session.runLatest('catalog-opportunities',s=>port.opportunities({limit:20,...(q?{q}:{})},s)),
      ]);
      if(port.session.getState().status==='READY'){
        if(c)setCourses(c);if(o)setOpportunities(o);
      }
    }finally{setBusy(false);}
  };
  const next=async(kind:'COURSE'|'OPPORTUNITY')=>{
    const previous=kind==='COURSE'?courses:opportunities;
    if(busy||scope.status!=='READY'||!previous?.nextCursor)return;
    setBusy(true);
    const query={afterId:previous.nextCursor,asOf:previous.asOf,limit:20,
      ...(selectedQuery?{q:selectedQuery}:{})};
    try{
      const add=await port.session.runLatest(kind==='COURSE'?'catalog-courses':'catalog-opportunities',
        signal=>kind==='COURSE'?port.courses(query,signal):port.opportunities(query,signal));
      if(!add||port.session.getState().status!=='READY')return;
      if(add.asOf!==previous.asOf)return;
      if(kind==='COURSE'){
        const page=add as CourseCatalogPage;
        const ids=new Set(previous.items.map(item=>(item as CourseCatalogPage['items'][number]).courseId));
        if(page.items.some(item=>ids.has(item.courseId)))return;
        setCourses({...page,items:[...(previous as CourseCatalogPage).items,...page.items]});
      }else{
        const page=add as OpportunityCatalogPage;
        const ids=new Set((previous as OpportunityCatalogPage).items.map(item=>item.opportunity.id));
        if(page.items.some(item=>ids.has(item.opportunity.id)))return;
        setOpportunities({...page,items:[...(previous as OpportunityCatalogPage).items,...page.items]});
      }
    }finally{setBusy(false);}
  };
  const showOfferings=async(id:string)=>{
    if(busy||scope.status!=='READY')return;
    setBusy(true);setOfferings(null);setDetail(null);
    try{
      const result=await port.session.runLatest('course-offerings',signal=>port.offerings(id,{limit:20},signal));
      if(result&&port.session.getState().status==='READY')setOfferings(result);
    }finally{setBusy(false);}
  };
  const showDetail=async(id:string)=>{
    if(busy||scope.status!=='READY')return;
    setBusy(true);setOfferings(null);setDetail(null);
    try{
      const result=await port.session.runLatest('opportunity-detail',signal=>port.detail(id,signal));
      if(result&&port.session.getState().status==='READY')setDetail(result);
    }finally{setBusy(false);}
  };

  if(scope.status==='IDLE'||scope.status==='CHECKING')
    return <p aria-busy="true">본인 소스 권한을 확인하는 중입니다.</p>;
  if(scope.status!=='READY')
    return <p role="alert">본인 자료의 접근권·출처·세션 또는 서버가 변경되었습니다. 이전 교과목·공고 데이터를 모두 비웠습니다. 다시 로그인 또는 새로고침하세요.</p>;
  return <section aria-label="본인 승인 교과목과 공고">
    <p role="note">현재 BETA 본인이 접근 허용된 독립 검수 자료만 서버에서 조회합니다. 공개 합성 공고나 다른 계정 자료로 대신하지 않으며, 지원·수강 가능 여부를 보장하지 않습니다.</p>
    <form onSubmit={e=>{void search(e);}}>
      <label>교과목·공고 이름 검색
        <input maxLength={100} value={text} onChange={e=>{
          setText(e.target.value);setCourses(null);setOpportunities(null);
          setOfferings(null);setDetail(null);setInputError('');
        }}/>
      </label>
      <button type="submit" disabled={busy}>승인된 자료 조회</button>
    </form>
    {inputError&&<p role="alert">{inputError}</p>}
    <section aria-label="승인된 교과목"><h2>교과목</h2>
      {!courses?<p aria-busy="true">자료 없음 또는 조회 중</p>
        :<><p>조회 기준 {courses.asOf} · {courses.items.length}개 표시</p>
          <ul>{courses.items.map(item=><li key={item.courseId}>
            <button disabled={busy} onClick={()=>{void showOfferings(item.courseId);}}>
              {item.title} ({item.courseCode}) · {item.creditUnits/2}학점 · 출처 {item.source.status}
            </button></li>)}</ul>
          <button disabled={busy||!courses.nextCursor} onClick={()=>{void next('COURSE');}}>다음 교과목</button>
        </>}
    </section>
    <section aria-label="승인된 공고"><h2>공고</h2>
      {!opportunities?<p aria-busy="true">자료 없음 또는 조회 중</p>
        :<><p>조회 기준 {opportunities.asOf} · {opportunities.items.length}개 표시</p>
          <ul>{opportunities.items.map(item=><li key={item.opportunity.id}>
            <button disabled={busy} onClick={()=>{void showDetail(item.opportunity.id);}}>
              {item.opportunity.title} · {item.opportunity.organization} · 출처 {item.source.status}
            </button></li>)}</ul>
          <button disabled={busy||!opportunities.nextCursor} onClick={()=>{void next('OPPORTUNITY');}}>다음 공고</button>
        </>}
    </section>
    {offerings&&<section aria-label="개설학기 확인"><h3>검증된 개설학기</h3>
      <p>시점 {offerings.asOf}; 미검증 개설 여부는 확정하지 않습니다.</p>
      <ul>{offerings.items.map(item=><li key={item.courseId+':'+item.term}>
        {item.term} · {item.status}</li>)}</ul>
    </section>}
    {detail&&<section aria-label="공고 세부 내역"><h3>현재 승인된 공고 세부</h3>
      <p>{detail.opportunity.title} · {detail.opportunity.organization} · {detail.source.status}</p>
      <p>지원 경로: {detail.opportunity.actualApplicationRoute} · 브라우저가 임의 공식 지원 URL을 만들지 않습니다.</p>
    </section>}
  </section>;
}
