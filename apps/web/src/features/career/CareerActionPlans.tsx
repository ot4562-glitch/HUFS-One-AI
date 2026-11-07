import {useState,type FormEvent} from 'react';
import type {OwnerWorkspaceRecord,OwnerWorkspaceValue} from '@hufs-one/contracts';
import {InAppLink} from '../../shell/AppShell.js';
import {newCareerAction,updateCareerAction} from './careerActions.js';

type Page={items:OwnerWorkspaceRecord[];nextCursor:string|null};
export function CareerActionPlans({bookmarks,actions,busy,onCreate,onEdit,onNext,onFirst,navigate}:{
  bookmarks:Page;actions:Page;busy:boolean;
  onCreate:(value:OwnerWorkspaceValue)=>void;
  onEdit:(record:OwnerWorkspaceRecord,value:OwnerWorkspaceValue)=>void;
  onNext:(cursor:string)=>void;onFirst?:()=>void;
  navigate:(path:string)=>void;
}){
  const allowed=bookmarks.items.filter(item=>
    item.value.kind==='BOOKMARK'&&item.value.dataMode==='OWNER_CONSENTED');
  const rows=actions.items.filter(item=>
    item.value.kind==='ACTION_PLAN'&&item.value.dataMode==='OWNER_CONSENTED');
  const [opportunity,setOpportunity]=useState('');
  const [task,setTask]=useState('');
  const [dueDate,setDueDate]=useState('');
  const [editing,setEditing]=useState<string|null>(null);
  const [error,setError]=useState('');
  const clear=()=>{setEditing(null);setTask('');setDueDate('');setError('');};
  const submit=(e:FormEvent)=>{
    e.preventDefault();setError('');
    try{
      const record=rows.find(row=>row.itemId===editing);
      if(editing&&!record)throw new Error('Missing plan version');
      if(record){
        onEdit(record,updateCareerAction(record,{task,dueDate}));
      }else{
        if(!allowed.some(row=>row.value.kind==='BOOKMARK'&&row.value.opportunityId===opportunity))
          throw new Error('Select a saved opportunity');
        onCreate(newCareerAction(opportunity,task,dueDate));
      }
      clear();
    }catch{setError('계획 입력이나 최신 판본을 확인해 주세요. 허가된 저장 기회만 연결합니다.');}
  };
  return <section aria-labelledby="career-action-heading">
    <h2 id="career-action-heading">기회별 나의 행동 계획 (비공개·자기 기록)</h2>
    <p role="note">여기에 적은 할 일은 모집처에 제출되지 않으며, 실제 지원 접수나 합격을 뜻하지 않습니다. 저장한 기회와 본인 계획을 연결합니다.</p>
    <form className="sandbox__form" onSubmit={submit}>
      <h3>{editing?'내 행동 계획 수정':'새 행동 계획 기록'}</h3>
      {!editing&&<><label htmlFor="career-action-opportunity">연결할 내가 저장한 기회</label>
        <select id="career-action-opportunity" value={opportunity} disabled={busy} required
          onChange={e=>setOpportunity(e.target.value)}>
          <option value="">저장 기회 선택</option>
          {allowed.map(row=>row.value.kind==='BOOKMARK'?
            <option key={row.itemId} value={row.value.opportunityId}>기회 {row.value.opportunityId}</option>:null)}
        </select></>}
      <label htmlFor="career-action-task">내가 할 일 (최대 160자)</label>
      <input id="career-action-task" maxLength={160} required disabled={busy} value={task}
        onChange={e=>setTask(e.target.value)}/>
      <label htmlFor="career-action-date">목표 날짜 (선택, 공식 모집 마감 아님)</label>
      <input id="career-action-date" type="date" disabled={busy} value={dueDate}
        onChange={e=>setDueDate(e.target.value)}/>
      <button type="submit" disabled={busy||!task.trim()||(!editing&&!opportunity)}>
        {editing?'행동 계획 수정 저장':'행동 계획 기록'}</button>
      {editing&&<button type="button" disabled={busy} onClick={clear}>수정 취소</button>}
    </form>
    {error&&<p role="alert">{error}</p>}
    {rows.length===0?<p>이 페이지에는 본인이 만든 행동 계획이 없습니다.</p>:<ul>{rows.map(row=>{
      if(row.value.kind!=='ACTION_PLAN')return null;
      const v=row.value;
      return <li key={row.itemId}>
        <p><InAppLink to={'/owner-opportunities/'+encodeURIComponent(v.opportunityId)} navigate={navigate}>
          연결된 기회 {v.opportunityId} (권한 재검사)</InAppLink>
          {' · '}{v.done?'본인이 완료로 표시':'아직 진행 중'}</p>
        <p>{v.task}{v.dueAt?' · 목표 날짜 '+v.dueAt.slice(0,10):''}</p>
        <button type="button" disabled={busy} onClick={()=>
          onEdit(row,updateCareerAction(row,{done:!v.done}))}>
          {v.done?'내 완료 표시 취소':'내가 완료로 표시'}</button>
        <button type="button" disabled={busy} onClick={()=>{
          setEditing(row.itemId);setTask(v.task);setDueDate(v.dueAt?.slice(0,10)??'');
        }}>계획 수정</button>
      </li>;
    })}</ul>}
    {actions.nextCursor&&<button type="button" disabled={busy}
      onClick={()=>onNext(actions.nextCursor!)}>다음 행동 계획 20건</button>}
    {actions.nextCursor&&<p role="note">행동 계획이 더 있습니다. 현재 화면은 전체 원장이 아닙니다.</p>}
    {onFirst&&<button type="button" disabled={busy} onClick={onFirst}>행동 계획 처음으로</button>}
  </section>;
}
