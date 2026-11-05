import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import type {z} from 'zod';
import {TOPIC_CODES,ClubDemoActivitySchema,SyntheticClubCreateSchema,SyntheticClubEditSchema,
  type SyntheticClubContent,type SyntheticClubCreate,type SyntheticClubEdit,type SyntheticClubAdminRecord,
  type SyntheticClubAdminListResponse,type SyntheticClubDecisionRequest,type SyntheticClubDecisionResponse,
  type SyntheticClubWriteResponseSchema} from '@hufs-one/contracts';
import {HufsApiError} from '../../integrations/api-error.js';
import {CATEGORY_TEXT,CAMPUS_TEXT} from './clubView.js';
import {TOPIC_TEXT} from '../demo/topicText.js';

export interface ClubModerationPort{
  list(signal?:AbortSignal):Promise<SyntheticClubAdminListResponse>;
  create(input:SyntheticClubCreate,signal?:AbortSignal):Promise<z.infer<typeof SyntheticClubWriteResponseSchema>>;
  edit(id:string,input:SyntheticClubEdit,signal?:AbortSignal):Promise<z.infer<typeof SyntheticClubWriteResponseSchema>>;
  decide(id:string,input:SyntheticClubDecisionRequest,signal?:AbortSignal):Promise<SyntheticClubDecisionResponse>;
}
const STATE={DRAFT:'초안',REVIEW_PENDING:'검토 대기',APPROVED:'가상 승인',REJECTED:'반려',EXPIRED:'만료',REVOKED:'승인 취소'} as const;
const ACTIVITY={STUDY:'스터디',PROJECT:'프로젝트',DEBATE:'토론',PERFORMANCE:'공연',VOLUNTEERING:'봉사',
  MATCH:'경기',TRIP:'답사·여행',NETWORKING:'교류',CREATION:'창작',MENTORING:'멘토링'} as const;
const INITIAL:SyntheticClubContent={clubName:'가상동아리 ',summary:'',category:'IT_AI',campus:'SEOUL',
  topicCodes:['AI_ML','DATA_ANALYTICS'],activities:['PROJECT','STUDY'],conditions:[],
  recruitClosesAt:'2026-11-22T00:00:00.000Z',posterAssetId:'SYN-POSTER-CLUB-090',dataMode:'SYNTHETIC'};
function editable(record:SyntheticClubAdminRecord):SyntheticClubContent{
  const {id,state,createdAt,updatedAt,approvedAt,...content}=record.post;return content;
}
function Fields({value,onChange,edit=false}:{value:SyntheticClubContent;onChange:(v:SyntheticClubContent)=>void;edit?:boolean}){
  const update=(patch:Partial<SyntheticClubContent>)=>onChange({...value,...patch});
  return <>
    <label>{edit?'이름 수정':'가상 동아리 이름'}<input value={value.clubName} maxLength={90} required onChange={e=>update({clubName:e.target.value})}/></label>
    <label>{edit?'소개 수정':'모집 소개'}<textarea value={value.summary} maxLength={400} required onChange={e=>update({summary:e.target.value})}/></label>
    <label>분야<select aria-label={edit?'분야 수정':'분야'} value={value.category} onChange={e=>update({category:e.target.value as SyntheticClubContent['category']})}>
      {Object.entries(CATEGORY_TEXT).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
    <label>캠퍼스<select aria-label={edit?'캠퍼스 수정':'캠퍼스'} value={value.campus} onChange={e=>update({campus:e.target.value as SyntheticClubContent['campus']})}>
      {Object.entries(CAMPUS_TEXT).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
    <label>관심 분야 (복수 선택)<select aria-label={edit?'관심 분야 수정':'관심 분야 (복수 선택)'} multiple value={value.topicCodes}
      onChange={e=>update({topicCodes:Array.from(e.target.selectedOptions,o=>o.value) as SyntheticClubContent['topicCodes']})}>
      {TOPIC_CODES.map(t=><option key={t} value={t}>{TOPIC_TEXT[t]}</option>)}</select></label>
    <label>희망 활동 (복수 선택)<select aria-label={edit?'희망 활동 수정':'희망 활동 (복수 선택)'} multiple value={value.activities}
      onChange={e=>update({activities:Array.from(e.target.selectedOptions,o=>o.value) as SyntheticClubContent['activities']})}>
      {ClubDemoActivitySchema.options.map(t=><option key={t} value={t}>{ACTIVITY[t]}</option>)}</select></label>
    <label>모집 시작 (ISO 시각, 빈칸은 미정)<input value={value.recruitOpensAt??''} placeholder="2026-11-20T00:00:00Z"
      onChange={e=>{const {recruitOpensAt,...rest}=value;onChange(e.target.value?{...rest,recruitOpensAt:e.target.value}:rest);}}/></label>
    <label>모집 마감 (ISO 시각, 빈칸은 미정)<input value={value.recruitClosesAt??''} placeholder="2026-11-22T00:00:00Z"
      onChange={e=>{const {recruitClosesAt,...rest}=value;onChange(e.target.value?{...rest,recruitClosesAt:e.target.value}:rest);}}/></label>
    <label>합성 포스터<select aria-label={edit?'합성 포스터 수정':'합성 포스터'} value={value.posterAssetId} onChange={e=>update({posterAssetId:e.target.value})}>
      {value.posterAssetId!=='SYN-POSTER-CLUB-090'&&<option value={value.posterAssetId}>기존 시연 일러스트 ({value.posterAssetId})</option>}
      <option value="SYN-POSTER-CLUB-090">AI 생성 합성 협업 그림 (090)</option></select></label>
    {value.conditions.length>0&&<p>기존 모집 조건 {value.conditions.length}개를 보존합니다. 조건 원문은 서버 검수 항목입니다.</p>}
  </>;
}
/** ADMIN UI is separate from owner/reviewer views. A failed operation removes
 * old records and drafts, and only the server's current revision can be used. */
export function ClubModerationPanel({port}:{port:ClubModerationPort}){
  const [loaded,setLoaded]=useState<SyntheticClubAdminListResponse|null>(null);
  const [status,setStatus]=useState<'LOADING'|'READY'|'ERROR'>('LOADING'),[message,setMessage]=useState('');
  const [id,setId]=useState('SYN-CLUB-090'),[content,setContent]=useState<SyntheticClubContent>(()=>structuredClone(INITIAL));
  const [drafts,setDrafts]=useState<Record<string,SyntheticClubContent>>({});
  const active=useRef<AbortController|null>(null),serial=useRef(0),busy=useRef(false);
  const perform=useCallback(async(operation?:(signal:AbortSignal)=>Promise<unknown>)=>{
    if(busy.current)return;
    busy.current=true;active.current?.abort();const controller=new AbortController();active.current=controller;
    const revision=++serial.current;setLoaded(null);setDrafts({});setStatus('LOADING');setMessage('');
    try{
      if(operation)await operation(controller.signal);
      const result=await port.list(controller.signal);
      if(controller.signal.aborted||serial.current!==revision)return;
      setLoaded(result);setDrafts(Object.fromEntries(result.records.map(r=>[r.post.id,editable(r)])));setStatus('READY');
    }catch(error){
      if(controller.signal.aborted||serial.current!==revision)return;
      setContent(structuredClone(INITIAL));setId('SYN-CLUB-090');
      setStatus('ERROR');setMessage(error instanceof HufsApiError&&error.code==='VERSION_CONFLICT'
        ?'자료가 먼저 변경됐어요. 승인 상태를 다시 확인한 뒤 새 버전으로 검토해 주세요.'
        :'현재 가상 관리자 권한 또는 게시 자료를 확인할 수 없어 이전 자료를 지웠어요.');
    }finally{if(serial.current===revision){busy.current=false;active.current=null;}}
  },[port]);
  useEffect(()=>{
    void perform();
    const refresh=()=>{if(!busy.current)void perform();};
    const visibility=()=>{
      if(document.visibilityState==='visible'){refresh();return;}
      ++serial.current;active.current?.abort();active.current=null;busy.current=false;
      setLoaded(null);setDrafts({});setContent(structuredClone(INITIAL));setId('SYN-CLUB-090');
      setStatus('LOADING');setMessage('');
    };
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visibility);
    return()=>{++serial.current;active.current?.abort();busy.current=false;
      window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visibility);};
  },[perform]);
  const create=(event:FormEvent)=>{
    event.preventDefault();const parsed=SyntheticClubCreateSchema.safeParse({id,content});
    if(!parsed.success){setMessage('가상 이름·소개·모집 시각을 확인해 주세요. 승인자와 기준 시점은 서버가 정합니다.');return;}
    void perform(signal=>port.create(parsed.data,signal));
  };
  const edit=(record:SyntheticClubAdminRecord,event:FormEvent)=>{
    event.preventDefault();const parsed=SyntheticClubEditSchema.safeParse({expectedVersion:record.version,content:drafts[record.post.id]});
    if(!parsed.success){setMessage('수정할 내용과 모집 시각을 확인해 주세요.');return;}
    void perform(signal=>port.edit(record.post.id,parsed.data,signal));
  };
  return <section aria-label="가상 관리자 동아리 검수">
    <p role="note">합성 시연용 관리자 화면입니다. 실제 학교·동아리의 승인이나 모집이 아닙니다. 모든 수정은 재승인을 기다리며 학생 목록과 추천에서 숨겨집니다.</p>
    <button type="button" disabled={status==='LOADING'} onClick={()=>{void perform();}}>승인 상태 새로고침</button>
    {message&&<p role={status==='ERROR'?'alert':'status'}>{message}</p>}
    {status==='LOADING'&&<p aria-busy="true">현재 관리자 권한과 게시 버전을 확인하고 있어요.</p>}
    {status==='READY'&&loaded&&<>
      <p>합성 기준 시점 {loaded.asOf}</p>
      <form onSubmit={create} aria-label="합성 모집 글 만들기">
        <h2>검토 대기 모집 글 만들기</h2>
        <label>합성 모집 ID<input value={id} pattern="SYN-CLUB-[0-9]{3}" maxLength={12} required onChange={e=>setId(e.target.value)}/></label>
        <Fields value={content} onChange={setContent}/>
        <p>미리 채운 내용은 2026년 11월 합성 시연 예시입니다. 실제 모집 정보는 입력하지 마세요.</p>
        <button type="submit">검토 대기 글 만들기</button>
      </form>
      <h2>게시·검수 이력</h2>
      {loaded.records.map(record=><section key={record.post.id+':'+record.version} aria-label={record.post.id+' 검수'}>
        <h3>{record.post.clubName}</h3><p>{STATE[record.post.state]} · 버전 {record.version}</p>
        <p>출처 {record.sourceRef} · 처리자 {record.lastActor.actorId} ({record.lastActor.role})</p>
        <p>적용 시점 {record.asOf} · 기록 시각 {record.recordedAt}</p>
        {record.post.state==='REVIEW_PENDING'&&<>
          <button type="button" onClick={()=>{void perform(signal=>port.decide(record.post.id,{expectedVersion:record.version,decision:'APPROVE'},signal));}}>승인</button>
          <button type="button" onClick={()=>{void perform(signal=>port.decide(record.post.id,{expectedVersion:record.version,decision:'REJECT'},signal));}}>반려</button></>}
        {record.post.state==='APPROVED'&&<button type="button" onClick={()=>{void perform(signal=>port.decide(record.post.id,{expectedVersion:record.version,decision:'REVOKE'},signal));}}>승인 취소</button>}
        {drafts[record.post.id]&&<details><summary>모집 내용 수정</summary><form onSubmit={e=>edit(record,e)}>
          <Fields value={drafts[record.post.id]!} edit onChange={next=>setDrafts(old=>({...old,[record.post.id]:next}))}/>
          <button type="submit">수정 후 재검토</button>
        </form></details>}
      </section>)}
    </>}
  </section>;
}
