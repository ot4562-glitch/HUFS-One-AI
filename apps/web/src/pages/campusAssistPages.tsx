import {useState,type FormEvent} from 'react';
import type {PageRenderer} from '../App.js';
import type {ExchangeApplicant} from '@hufs-one/contracts';
import {archiveActivities,forecastActivity} from '../../../../packages/core/src/campus-assist/activities.js';
import {evaluateExchange} from '../../../../packages/core/src/campus-assist/exchange.js';
import {retrieveFaqEvidence,type FaqEvidence} from '../../../../packages/core/src/campus-assist/faq.js';
import {SYNTHETIC_ACTIVITIES,SYNTHETIC_FAQ_DOCUMENTS,SYNTHETIC_ORGANIZATIONS,SYNTHETIC_PARTNERS} from '../features/campus-assist/synthetic.js';
import {InAppLink} from '../shell/AppShell.js';
import {OwnerActivityPanel,OwnerExchangePanel,OwnerFaqPanel} from '../features/campus-assist/OwnerPanels.js';

const NOTICE='이 화면은 허구의 합성 데이터로 기능을 검증하는 시연입니다. 실제 학교 행사·교환학생 요건·FAQ 답변이 아닙니다.';
const labels={PASS:'입력 기준 충족',FAIL:'기준 불충족',UNKNOWN:'확인 필요',NOT_APPLICABLE:'해당 없음'} as const;
function ActivityDemo({navigate}: {navigate:(p:string)=>void}){
  const [org,setOrg]=useState('ALL');
  const [q,setQ]=useState('');
  const [year,setYear]=useState('ALL');
  const asOf=new Date().toISOString();
  const rows=archiveActivities(SYNTHETIC_ACTIVITIES,asOf,{
    ...(org==='ALL'?{}:{organizationId:org}),
    ...(year==='ALL'?{}:{year:Number(year)}),query:q,
  });
  const nextYear=new Date().getUTCFullYear()+1;
  const forecasts=SYNTHETIC_ORGANIZATIONS.filter(o=>org==='ALL'||o.id===org).map(o=>{
    const first=SYNTHETIC_ACTIVITIES.find(r=>r.organizationId===o.id)!;
    return {organization:o.name,...forecastActivity(SYNTHETIC_ACTIVITIES,asOf,nextYear,o.id,first.seriesId)};
  });
  return <section className="section" aria-label="가상 활동 아카이브">
    <p role="note" className="muted">{NOTICE} 공식 SNS 자동 수집·권한 확인은 별도로 연결해야 합니다.</p>
    <div className="club__filters" role="search" aria-label="가상 활동 필터">
      <label htmlFor="activity-org">주최 조직</label>
      <select id="activity-org" value={org} onChange={e=>setOrg(e.target.value)}>
        <option value="ALL">모든 가상 조직</option>
        {SYNTHETIC_ORGANIZATIONS.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <label htmlFor="activity-year">연도</label>
      <select id="activity-year" value={year} onChange={e=>setYear(e.target.value)}>
        <option value="ALL">모든 연도</option>{[2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}
      </select>
      <label htmlFor="activity-search">활동 검색</label>
      <input id="activity-search" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="행사명" />
    </div>
    <h2 className="section__title">조직별 활동 기록</h2>
    <p role="status">{rows.length}건의 합성 기록</p>
    {rows.length===0?<p className="muted">조건에 맞는 활동이 없습니다.</p>:
      <ul className="club__grid">{rows.map(r=><li className="club" key={r.entryId}>
        <div className="club__body">
          <h3 className="club__title">{r.title}</h3>
          <p>개최일: {r.eventDate||'미확인'} · 공지일: {r.publishedAt.slice(0,10)}</p>
          <p>상태: {r.status==='CONFIRMED'?'합성 확정 기록':r.status==='CANCELLED'?'취소':'공지 단계'}</p>
          <p className="muted">출처: 허구 fixture {r.revisionId} · 확인 {r.verifiedAt.slice(0,10)}</p>
        </div></li>)}</ul>}
    <h2 className="section__title">{nextYear}년 활동 시기 전망 (공식 일정 아님)</h2>
    <ul>{forecasts.map(f=><li key={f.organizationId}>
      <strong>{f.organization}</strong> — {f.state==='PREDICTED'
        ? '예상 기간 '+f.from+' ~ '+f.to+' ('+(f.confidence==='MEDIUM'?'보통':'낮음')+' 신뢰)'
        : f.state==='CONFIRMED'?'출처에서 확정됨':f.state==='CANCELLED'?'취소': '예측 보류'}
      <p className="muted">{f.reason} · 근거 연도 {f.observedYears.join(', ')||'없음'}</p>
    </li>)}</ul>
    <p><InAppLink to="/notices" navigate={navigate}>실제 공지·마감 캘린더 메뉴</InAppLink></p>
  </section>;
}
function ExchangeDemo({navigate}: {navigate:(p:string)=>void}){
  const [duration,setDuration]=useState<1|2>(1);
  const [gpa,setGpa]=useState('3.2');
  const [sem,setSem]=useState('3');
  const [status,setStatus]=useState<ExchangeApplicant['status']>('ENROLLED');
  const [transfer,setTransfer]=useState('NO');
  const [cancel,setCancel]=useState<ExchangeApplicant['previousCancellation']>('CLEAR');
  const [partner,setPartner]=useState(0);
  const [language,setLanguage]=useState('TOEFL');
  const [score,setScore]=useState('90');
  const [expiry,setExpiry]=useState('2027-01-01');
  const [departure,setDeparture]=useState('2026-09-01');
  const current=SYNTHETIC_PARTNERS[partner]!;
  const applicant:ExchangeApplicant={duration,track:'OIA',status,previousCancellation:cancel,
    ...(gpa!==''?{gpa:Number(gpa)}:{}),...(sem!==''?{completedSemesters:Number(sem)}:{}),
    ...(transfer==='UNKNOWN'?{}:{transfer:transfer==='YES'}),
    ...(language&&score!==''&&expiry?{language:{test:language,score:Number(score),expiresOn:expiry}}:{}),
    ...(departure?{departureOn:departure}:{})};
  const result=evaluateExchange(applicant,current,new Date().toISOString());
  return <section className="section" aria-label="가상 교환학생 자격 검토">
    <p className="muted" role="note">{NOTICE} 입력값은 이 브라우저 화면에서만 계산하며 학적·성적표를 전송하지 않습니다.</p>
    <div className="club__filters">
      <label htmlFor="ex-partner">합성 파견대학</label>
      <select id="ex-partner" value={partner} onChange={e=>setPartner(Number(e.target.value))}>
        {SYNTHETIC_PARTNERS.map((p,i)=><option key={p.partnerId} value={i}>가상 대학 {i+1}</option>)}
      </select>
      <label htmlFor="ex-duration">파견 기간</label>
      <select id="ex-duration" value={duration} onChange={e=>setDuration(Number(e.target.value) as 1|2)}>
        <option value={1}>1학기</option><option value={2}>2학기</option>
      </select>
      <label htmlFor="ex-status">재학 상태</label>
      <select id="ex-status" value={status} onChange={e=>setStatus(e.target.value as ExchangeApplicant['status'])}>
        <option value="ENROLLED">재학</option><option value="LEAVE">휴학</option><option value="UNKNOWN">미확인</option>
      </select>
      <label htmlFor="ex-sem">수료 학기 수</label><input id="ex-sem" type="number" min="0" max="15" value={sem} onChange={e=>setSem(e.target.value)}/>
      <label htmlFor="ex-gpa">신고 평점평균 (0~4.5)</label>
      <input id="ex-gpa" type="number" min="0" max="4.5" step="0.01" value={gpa} onChange={e=>setGpa(e.target.value)}/>
      <label htmlFor="ex-transfer">편입생 여부</label>
      <select id="ex-transfer" value={transfer} onChange={e=>setTransfer(e.target.value)}>
        <option value="NO">아니오</option><option value="YES">예</option><option value="UNKNOWN">미확인</option>
      </select>
      <label htmlFor="ex-cancel">이전 프로그램 취소 이력</label>
      <select id="ex-cancel" value={cancel} onChange={e=>setCancel(e.target.value as ExchangeApplicant['previousCancellation'])}>
        <option value="CLEAR">없음</option><option value="CANCELLED">있음</option><option value="UNKNOWN">미확인</option>
      </select>
      <label htmlFor="ex-test">어학 시험</label><input id="ex-test" value={language} maxLength={60} onChange={e=>setLanguage(e.target.value)}/>
      <label htmlFor="ex-score">어학 점수</label><input id="ex-score" type="number" min="0" value={score} onChange={e=>setScore(e.target.value)}/>
      <label htmlFor="ex-expiry">어학 성적 만료일</label><input id="ex-expiry" type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/>
      <label htmlFor="ex-departure">예상 파견일</label><input id="ex-departure" type="date" value={departure} onChange={e=>setDeparture(e.target.value)}/>
    </div>
    <h2 className="section__title">가상 조건 점검: {labels[result.result]}</h2>
    <p className="muted">{result.disclaimer} · 규정판본 {result.policyRevision||'미확인'}</p>
    <ul>{result.checks.map(c=><li key={c.code}><strong>{c.code}: {labels[c.status]}</strong> — {c.explanation}</li>)}</ul>
    <h2 className="section__title">파견 전 준비</h2>
    <p>최신 모집 공고, 파견대학별 요건, 어학 유효기간, 학점인정내규, 제출서류와 학기 계획을 학교에 직접 확인하세요.</p>
    <p><a href="https://oia.hufs.ac.kr/oia/19673/subview.do" target="_blank" rel="noopener noreferrer">한국외대 국제교류팀 공식 교환학생 안내</a></p>
    <p><InAppLink to="/faq" navigate={navigate}>관련 FAQ 질문하기</InAppLink></p>
  </section>;
}
function FaqDemo({navigate}: {navigate:(p:string)=>void}){
  const [question,setQuestion]=useState('');
  const [searched,setSearched]=useState(false);
  const [found,setFound]=useState<readonly FaqEvidence[]>([]);
  const submit=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(question.trim().length<2)return;
    setFound(retrieveFaqEvidence(question,SYNTHETIC_FAQ_DOCUMENTS,new Date().toISOString()));
    setSearched(true);
  };
  return <section className="section" aria-label="FAQ 질문하기">
    <p role="note" className="muted">{NOTICE} 아래 검색은 오프라인 가상 문서입니다. HCX-007 라이브 답변은 운영 서버 모델·출처 권리·비용 게이트가 연결되기 전까지 비활성 상태입니다.</p>
    <form onSubmit={submit} role="search">
      <label htmlFor="faq-question">질문</label>
      <input id="faq-question" value={question} maxLength={500} onChange={e=>setQuestion(e.target.value)} placeholder="예: 교환학생 어학 유효기간" required minLength={2}/>
      <button type="submit">합성 근거 검색</button>
    </form>
    <div role="status" aria-live="polite">
      {!searched?<p>질문을 입력하면 가상 문서에서 일치하는 근거 문단을 찾습니다.</p>
        : found.length===0?<p>검색 근거가 없습니다. 공식 담당 부서 확인이 필요합니다.</p>
        : <><h2 className="section__title">검증 대상 근거 문단 (AI 답변 아님)</h2>
          <ul>{found.map(x=><li key={x.citationId}>
            <strong>{x.title}</strong><p>{x.text}</p>
            <p className="muted">합성 문서 · {x.citationId} · 확인 {x.verifiedAt.slice(0,10)}</p>
          </li>)}</ul></>}
    </div>
    <p><InAppLink to="/exchange" navigate={navigate}>교환학생 조건 확인</InAppLink> · <InAppLink to="/activities" navigate={navigate}>학과 활동 아카이브</InAppLink></p>
  </section>;
}
export const activityArchivePage:PageRenderer=({path,navigate,services})=>path==='/activities'
  ? {title:'학과·학생회 활동 기록과 시기 전망',body:services.campusAssist
    ? <OwnerActivityPanel port={services.campusAssist} navigate={navigate}/>
    : <ActivityDemo navigate={navigate}/>} : null;
export const exchangePage:PageRenderer=({path,navigate,services})=>path==='/exchange'
  ? {title:'교환학생 지원 조건 비교',body:services.campusAssist
    ? <OwnerExchangePanel port={services.campusAssist} navigate={navigate}/>
    : <ExchangeDemo navigate={navigate}/>} : null;
export const faqPage:PageRenderer=({path,navigate,services})=>path==='/faq'
  ? {title:'FAQ·질문하기',body:services.campusAssist
    ? <OwnerFaqPanel port={services.campusAssist} navigate={navigate}/>
    : <FaqDemo navigate={navigate}/>} : null;
