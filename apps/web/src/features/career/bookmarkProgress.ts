import {isNextBookmarkStage,type BookmarkOutcome,type BookmarkStage,type OwnerWorkspaceRecord} from '@hufs-one/contracts';

const NEXT:Record<BookmarkStage,BookmarkStage|null>={
  INTERESTED:'PREPARING',
  PREPARING:'SUBMITTED_SELF_REPORTED',
  SUBMITTED_SELF_REPORTED:'AWAITING_RESULT',
  AWAITING_RESULT:'RESULT_RECORDED',
  RESULT_RECORDED:null,
};
export const STAGE_NAMES:Record<BookmarkStage,string>={
  INTERESTED:'관심 있는 기회',
  PREPARING:'지원 준비 중 (자기 기록)',
  SUBMITTED_SELF_REPORTED:'본인이 지원했다고 기록함 · 외부 접수 미확인',
  AWAITING_RESULT:'본인이 결과를 기다린다고 기록함',
  RESULT_RECORDED:'결과를 직접 기록함 · 공식 결과 미확인',
};

/** Client-side affordance only; authenticated server enforces the same CAS transition. */
export function nextBookmarkStage(record:OwnerWorkspaceRecord):BookmarkStage|null{
  if(record.value.kind!=='BOOKMARK'||record.value.dataMode!=='OWNER_CONSENTED')return null;
  const current=record.value.stage??'INTERESTED';
  const next=NEXT[current];
  return next&&isNextBookmarkStage(current,next)?next:null;
}

/** No terminal result is ever treated as an official employer outcome. */
export function bookmarkProgressInput(record:OwnerWorkspaceRecord,result?:BookmarkOutcome['result']){
  const stage=nextBookmarkStage(record);
  if(!stage)throw new Error('Bookmark cannot advance');
  if(stage==='RESULT_RECORDED'){
    if(!result)throw new Error('Explicit self-reported result required');
    return {stage,outcome:{provenance:'USER_ENTERED_UNVERIFIED' as const,result}};
  }
  if(result)throw new Error('Nonterminal bookmark cannot include a result');
  return {stage};
}
