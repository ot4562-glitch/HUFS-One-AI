import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {ActivityForecast,ActivityRecord,ExchangeApplicant,ExchangeResult,FaqAskResponse} from '@hufs-one/contracts';
import type {CampusAssistPort} from './ownerPort.js';
import {InAppLink} from '../../shell/AppShell.js';

const unavailable='승인된 공식 자료/서버 기능이 연결되지 않았습니다. 실제 학교 자료를 추정하지 않고 표시를 보류합니다.';
const statusLabel={PASS:'입력 기준 충족',FAIL:'기준 불충족',UNKNOWN:'확인 필요',NOT_APPLICABLE:'해당 없음'} as const;
const outlookLabel:Record<ActivityForecast['state'],string>={
  PREDICTED:'예상 기간 (공식 공지 아님)',CONFIRMED:'공식 기록 확인',
  CANCELLED:'취소 기록 확인',INSUFFICIENT_DATA:'예측 근거 부족',UNKNOWN:'예측 보류',
};

export function OwnerActivityPanel({port,navigate}:{port:CampusAssistPort;navigate:(p:string)=>void}){
  const [items,setItems]=useState<readonly ActivityRecord[]|null>(null);
  const [forecasts,setForecasts]=useState<readonly ActivityForecast[]>([]);
  const [error,setError]=useState(false);
  const [org,setOrg]=useState('ALL'),[year,setYear]=useState('ALL'),[query,setQuery]=useState('');
  useEffect(()=>{
    const abort=new AbortController(),asOf=new Date().toISOString();
    void (async()=>{
      try{
        const snapshot=await port.activities({asOf},abort.signal);
        if(abort.signal.aborted)return;
        setItems(snapshot.items);
        const distinct=[...new Map(snapshot.items.map(row=>[row.organizationId+':'+row.seriesId,
          {organizationId:row.organizationId,seriesId:row.seriesId}])).values()].slice(0,12);
        const outlook=await Promise.all(distinct.map(x=>port.forecast({...x,asOf,
          targetYear:new Date().getUTCFullYear()+1},abort.signal)));
        if(!abort.signal.aborted)setForecasts(outlook);
      }catch{if(!abort.signal.aborted)setError(true);}
    })();
    return ()=>abort.abort();
  },[port]);
  const shown=(items||[]).filter(row=>(org==='ALL'||row.organizationId===org)
    &&(year==='ALL'||(row.eventDate||row.publishedAt.slice(0,10)).startsWith(year))
    &&(!query||row.title.toLocaleLowerCase('ko').includes(query.toLocaleLowerCase('ko'))));
  const organizations=[...new Set(items?.map(i=>i.organizationId)||[])].sort();
  return <section className="section">
    <p className="muted" role="note">학교 공식 서비스가 아닙니다. 자료 이용권·출처 판본·검증 시점이 확인된 자료만 표시합니다. 제공되지 않는 연도는 미개설이 아니라 미수집일 수 있습니다.</p>
    {error?<p role="alert">{unavailable}</p>:items===null?<p role="status">인증된 활동 기록을 확인하고 있습니다.</p>:<>
      <form role="search" onSubmit={e=>e.preventDefault()} className="club__filters">
        <label htmlFor="owner-act-org">조직</label>
        <select id="owner-act-org" value={org} onChange={e=>setOrg(e.target.value)}>
          <option value="ALL">전체</option>{organizations.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
        <label htmlFor="owner-act-year">연도</label>
        <select id="owner-act-year" value={year} onChange={e=>setYear(e.target.value)}>
          <option value="ALL">전체</option>{[2023,2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <label htmlFor="owner-act-q">검색</label>
        <input id="owner-act-q" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} />
      </form>
      <p role="status">조회된 {items.length}건 중 {shown.length}건 표시</p>
      {shown.length===0?<p>검증된 활동 기록이 없습니다.</p>:
        <ul>{shown.map(row=><li key={row.entryId}><strong>{row.title}</strong>
          <p>{row.organizationId} · 행사일 {row.eventDate||'미확인'} · 게시일 {row.publishedAt.slice(0,10)}
            · {row.status==='CANCELLED'?'취소':row.status==='CONFIRMED'?'확인된 기록':'공지'}</p>
          <p>{row.provenance==='SYNTHETIC'?'가상 합성 자료':'출처 승인 기록'}
            · <a target="_blank" rel="noopener noreferrer" href={row.sourceUrl}>출처 열기</a>
            · 판본 {row.revisionId}</p></li>)}</ul>}
      <h2 className="section__title">반복 행사 예상 기간</h2>
      {forecasts.length===0?<p>예상 자료가 없거나 현재 확인 중입니다.</p>:
        <ul>{forecasts.map(f=><li key={f.organizationId+':'+f.seriesId}>
          <strong>{f.organizationId} · {f.seriesId}</strong> — {outlookLabel[f.state]}
          {f.from&&f.to?' '+f.from+' ~ '+f.to:''}
          <p className="muted">{f.reason} · 과거 근거 {f.observedYears.join(', ')||'없음'}</p>
        </li>)}</ul>}
    </>}
    <p><InAppLink to="/notices" navigate={navigate}>학사 공지·캘린더</InAppLink></p>
  </section>;
}

type PartnerList=Awaited<ReturnType<CampusAssistPort['partners']>>['partners'];
type ExchangeComparison={partner:PartnerList[number];evaluation:ExchangeResult};
// The partner ID can appear under multiple application tracks; keep both in UI identity.
const exchangePartnerKey=(partner:PartnerList[number])=>partner.partnerId+'|'+partner.track;
export function OwnerExchangePanel({port,navigate}:{port:CampusAssistPort;navigate:(p:string)=>void}){
  const [partners,setPartners]=useState<PartnerList|null>(null),[failure,setFailure]=useState(false);
  const [chosen,setChosen]=useState(''),[compare2,setCompare2]=useState(''),[compare3,setCompare3]=useState('');
  const [duration,setDuration]=useState<1|2>(1),[status,setStatus]=useState<ExchangeApplicant['status']>('ENROLLED');
  const [semesters,setSemesters]=useState('3'),[gpa,setGpa]=useState('3.0');
  const [transfer,setTransfer]=useState('UNKNOWN');
  const [cancellation,setCancellation]=useState<ExchangeApplicant['previousCancellation']>('UNKNOWN');
  const [test,setTest]=useState(''),[score,setScore]=useState('');
  const [expiry,setExpiry]=useState(''),[departure,setDeparture]=useState('');
  const [result,setResult]=useState<readonly ExchangeComparison[]|null>(null),[busy,setBusy]=useState(false);
  const abort=useRef<AbortController|null>(null);
  const requestVersion=useRef(0);
  const clear=()=>{
    requestVersion.current++;abort.current?.abort();abort.current=null;
    setResult(null);setBusy(false);setFailure(false);
  };
  useEffect(()=>{
    const controller=new AbortController();
    requestVersion.current++;abort.current?.abort();abort.current=null;
    setPartners(null);setChosen('');setCompare2('');setCompare3('');
    setResult(null);setBusy(false);setFailure(false);
    void port.partners(new Date().toISOString(),controller.signal)
      .then(page=>{
        if(!controller.signal.aborted){
          setPartners(page.partners);
          setChosen(page.partners[0]?exchangePartnerKey(page.partners[0]):'');
        }
      })
      .catch(()=>{if(!controller.signal.aborted)setFailure(true);});
    return ()=>{controller.abort();requestVersion.current++;abort.current?.abort();};
  },[port]);
  const partner=partners?.find(p=>exchangePartnerKey(p)===chosen);
  const chosenPartners=[chosen,compare2,compare3]
    .filter((key,index,all)=>!!key&&all.indexOf(key)===index)
    .map(key=>partners?.find(p=>exchangePartnerKey(p)===key))
    .filter((p):p is PartnerList[number]=>!!p);
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!partner||busy||chosenPartners.length===0)return;
    abort.current?.abort();
    const controller=new AbortController();abort.current=controller;
    const ticket=++requestVersion.current;
    const asOf=new Date().toISOString();
    const base:Omit<ExchangeApplicant,'track'>={duration,status,previousCancellation:cancellation,
      ...(semesters?{completedSemesters:Number(semesters)}:{}),
      ...(gpa?{gpa:Number(gpa)}:{}),
      ...(transfer!=='UNKNOWN'?{transfer:transfer==='YES'}:{}),
      ...(test&&score&&expiry?{language:{test,score:Number(score),expiresOn:expiry}}:{}),
      ...(departure?{departureOn:departure}:{})};
    const snapshot=[...chosenPartners];
    setBusy(true);setResult(null);setFailure(false);
    // Sequential, one actor-scoped request per selected approved partner. Never
    // reveal partial results if quota, rights, policy revision or identity changes.
    void (async()=>{
      try{
        const rows:ExchangeComparison[]=[];
        for(const p of snapshot){
          const evaluation=await port.evaluate({asOf,partnerId:p.partnerId,
            applicant:{...base,track:p.track}},controller.signal);
          if(controller.signal.aborted||ticket!==requestVersion.current)return;
          if(Date.parse(evaluation.asOf)!==Date.parse(asOf)
            ||evaluation.policyRevision!==p.sourceRevision)
            throw new Error('Stale or conflicting exchange policy revision');
          rows.push({partner:p,evaluation});
        }
        if(!controller.signal.aborted&&ticket===requestVersion.current)setResult(rows);
      }catch{
        if(!controller.signal.aborted&&ticket===requestVersion.current)setFailure(true);
      }finally{
        if(!controller.signal.aborted&&ticket===requestVersion.current)setBusy(false);
      }
    })();
  };
  return <section className="section">
    <p className="muted" role="note">독립적인 참고용 자격 점검입니다. 합격·선발이나 학교 공식 적격 결정이 아닙니다. 입력은 이 화면에서만 유지하며 서버가 현행 규정 판본·권리를 검사합니다.</p>
    {failure&&<p role="alert">{unavailable}</p>}
    {partners===null?<p role="status">승인된 파견대학 규정을 확인 중입니다.</p>:partners.length===0
      ?<p>현재 사용 권한과 최신성이 검증된 파견대학 요건이 없습니다.</p>:<>
      <form onSubmit={submit} className="club__filters">
        <label htmlFor="owner-ex-partner">파견대학 식별자</label>
        <select id="owner-ex-partner" value={chosen} onChange={e=>{
          clear();setChosen(e.target.value);
          if(compare2===e.target.value)setCompare2('');
          if(compare3===e.target.value)setCompare3('');
        }}>
          {partners.map(p=><option key={exchangePartnerKey(p)} value={exchangePartnerKey(p)}>{p.partnerId} · {p.track}</option>)}
        </select>
        <label htmlFor="owner-ex-compare-2">비교할 두 번째 대학 (선택)</label>
        <select id="owner-ex-compare-2" value={compare2} onChange={e=>{
          clear();setCompare2(e.target.value);
          if(compare3===e.target.value)setCompare3('');
        }}>
          <option value="">비교하지 않음</option>
          {partners.filter(p=>exchangePartnerKey(p)!==chosen).map(p=>
            <option key={exchangePartnerKey(p)} value={exchangePartnerKey(p)}>{p.partnerId} · {p.track}</option>)}
        </select>
        <label htmlFor="owner-ex-compare-3">비교할 세 번째 대학 (선택)</label>
        <select id="owner-ex-compare-3" value={compare3} onChange={e=>{
          clear();setCompare3(e.target.value);
        }}>
          <option value="">비교하지 않음</option>
          {partners.filter(p=>exchangePartnerKey(p)!==chosen&&exchangePartnerKey(p)!==compare2).map(p=>
            <option key={exchangePartnerKey(p)} value={exchangePartnerKey(p)}>{p.partnerId} · {p.track}</option>)}
        </select>
        <p className="muted" role="note">최대 세 대학의 검증된 요건을 같은 조회 시점·자기 입력으로 비교합니다. 각 대학의 선발 경로에 맞는 규정을 독립적으로 조회하며 자동 지원하지 않습니다.</p>
        <p role="note" className="muted">승인된 공개 요건: 기본 평점 {partner?.minimumGpa??'미확인'},
          대학 추가 평점 {partner?.partnerMinimumGpa??'미확인'},
          어학 {partner?.requiredLanguage?partner.requiredLanguage.test+' '+partner.requiredLanguage.minimumScore:'미확인'}
          ({partner?.provenance==='SYNTHETIC'?'합성':'검증된 출처'}).</p>
        <label htmlFor="owner-ex-duration">파견기간</label>
        <select id="owner-ex-duration" value={duration} onChange={e=>{setDuration(Number(e.target.value) as 1|2);clear();}}>
          <option value={1}>1학기</option><option value={2}>2학기</option>
        </select>
        <label htmlFor="owner-ex-status">재학·휴학</label>
        <select id="owner-ex-status" value={status} onChange={e=>{setStatus(e.target.value as ExchangeApplicant['status']);clear();}}>
          <option value="ENROLLED">재학</option><option value="LEAVE">휴학</option><option value="UNKNOWN">미확인</option>
        </select>
        <label htmlFor="owner-ex-sem">수료 학기</label>
        <input id="owner-ex-sem" type="number" min="0" max="15" value={semesters} onChange={e=>{setSemesters(e.target.value);clear();}}/>
        <label htmlFor="owner-ex-gpa">평점평균 (0~4.5)</label>
        <input id="owner-ex-gpa" type="number" min="0" max="4.5" step="0.01" value={gpa} onChange={e=>{setGpa(e.target.value);clear();}}/>
        <label htmlFor="owner-ex-trans">편입생 여부</label>
        <select id="owner-ex-trans" value={transfer} onChange={e=>{setTransfer(e.target.value);clear();}}>
          <option value="UNKNOWN">미확인</option><option value="YES">예</option><option value="NO">아니오</option>
        </select>
        <label htmlFor="owner-ex-cancel">이전 선발 취소</label>
        <select id="owner-ex-cancel" value={cancellation} onChange={e=>{setCancellation(e.target.value as ExchangeApplicant['previousCancellation']);clear();}}>
          <option value="UNKNOWN">미확인</option><option value="CANCELLED">있음</option><option value="CLEAR">없음</option>
        </select>
        <label htmlFor="owner-ex-lang">시험종류</label>
        <input id="owner-ex-lang" maxLength={120} value={test} onChange={e=>{setTest(e.target.value);clear();}}/>
        <label htmlFor="owner-ex-score">어학 점수</label>
        <input id="owner-ex-score" type="number" min="0" value={score} onChange={e=>{setScore(e.target.value);clear();}}/>
        <label htmlFor="owner-ex-expiry">유효기간</label>
        <input id="owner-ex-expiry" type="date" value={expiry} onChange={e=>{setExpiry(e.target.value);clear();}}/>
        <label htmlFor="owner-ex-depart">예상 파견일</label>
        <input id="owner-ex-depart" type="date" value={departure} onChange={e=>{setDeparture(e.target.value);clear();}}/>
        <button type="submit" disabled={!partner||busy}>{busy?'검증 중':'선택 대학 조건 비교'}</button>
      </form>
      {result&&<section aria-live="polite" aria-label="파견대학별 비교 결과">
        <h2 className="section__title">{result.length}개 파견대학 비교 (공식 선발 판정 아님)</h2>
        <ul>{result.map(({partner:p,evaluation})=><li key={exchangePartnerKey(p)}>
          <h3>{p.partnerId} · {p.track} — 참고 결과: {statusLabel[evaluation.result]}</h3>
          <p>{evaluation.disclaimer}</p>
          <ul>{evaluation.checks.map(c=><li key={c.code}>{c.code}: {statusLabel[c.status]} · {c.explanation}</li>)}</ul>
          <p>적용 규정 판본: {evaluation.policyRevision} ·
            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">파견대학 요건 출처 확인</a></p>
        </li>)}</ul>
      </section>}
    </>}
    <p><InAppLink to="/faq" navigate={navigate}>학사 FAQ</InAppLink></p>
  </section>;
}
export function OwnerFaqPanel({port,navigate}:{port:CampusAssistPort;navigate:(p:string)=>void}){
  const [question,setQuestion]=useState(''),[answer,setAnswer]=useState<FaqAskResponse|null>(null);
  const [busy,setBusy]=useState(false),[failure,setFailure]=useState(false);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  const submit=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    active.current?.abort();const controller=new AbortController();active.current=controller;
    setBusy(true);setFailure(false);setAnswer(null);
    void port.ask({question,asOf:new Date().toISOString()},controller.signal)
      .then(value=>{if(!controller.signal.aborted)setAnswer(value);})
      .catch(()=>{if(!controller.signal.aborted)setFailure(true);})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
  };
  return <section className="section">
    <p className="muted" role="note">학교 공식 상담이 아닙니다. 출처·판본이 검증된 문서만 검색하고, HCX-007 응답은 항상 사람이 확인할 후보로 표시합니다.</p>
    <form onSubmit={submit} role="search">
      <label htmlFor="owner-faq-query">질문</label>
      <input id="owner-faq-query" minLength={2} maxLength={500} required value={question}
        onChange={e=>setQuestion(e.target.value)} placeholder="예: 교환학생 어학 성적 유효기간"/>
      <button type="submit" disabled={busy}>{busy?'검증 중':'질문 전송'}</button>
    </form>
    {failure&&<p role="alert">{unavailable}</p>}
    <div aria-live="polite">{answer?.status==='NOT_FOUND'
      ?<p>검증된 출처가 없어 답변할 수 없습니다.</p>
      :answer?.status==='CONFIGURATION_REQUIRED'
      ?<p>승인된 HCX-007 모델 실행·과금·입력 전송 권한이 구성되지 않았습니다. 질문을 외부 모델에 보내지 않았습니다.</p>
      :answer?.status==='NEEDS_REVIEW'
      ?<article>
        <h2 className="section__title">AI 답변 후보 (사람 검증 전)</h2><p>{answer.answer.answer}</p>
        <h3>인용 근거</h3>
        <ul>{answer.answer.citations.map(c=>{
          const source=answer.evidence.find(e=>e.citationId===c.citationId);
          return <li key={c.citationId}><q>{c.quote}</q>
            {source&&<p><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{source.title} · 검증 {source.verifiedAt.slice(0,10)}</a></p>}
          </li>;
        })}</ul>
        <p className="muted">응답 상태: NEEDS_REVIEW. 학교 공식 적격·마감·학점 판정이 아닙니다.</p>
      </article>:null}</div>
    <p><InAppLink to="/exchange" navigate={navigate}>교환학생 기준 점검</InAppLink></p>
  </section>;
}
