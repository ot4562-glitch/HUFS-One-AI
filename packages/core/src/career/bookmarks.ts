import {OwnerWorkspaceRecordSchema,type BookmarkStage} from '@hufs-one/contracts';

const LABELS:Record<BookmarkStage,string>={
  INTERESTED:'관심 있는 기회',
  PREPARING:'지원 준비 중 (본인 기록)',
  SUBMITTED_SELF_REPORTED:'지원했다고 본인이 기록함 · 외부 접수 미확인',
  AWAITING_RESULT:'결과를 기다리는 중 (본인 기록)',
  RESULT_RECORDED:'결과를 본인이 기록함 · 공식 결과 미확인',
};
export interface CareerSavedItem {
  readonly itemId:string;
  readonly opportunityId:string;
  readonly stage:BookmarkStage;
  readonly label:string;
  readonly outcome:string|null;
  readonly synthetic:boolean;
}
/** Uses existing owner-only BOOKMARK records, never infers a submission or award. */
export function careerSavedItem(raw:unknown):CareerSavedItem {
  const record=OwnerWorkspaceRecordSchema.parse(raw);
  if(record.value.kind!=='BOOKMARK')throw new TypeError('Expected an owner bookmark');
  const stage=record.value.stage??'INTERESTED';
  return {
    itemId:record.itemId,opportunityId:record.value.opportunityId,stage,label:LABELS[stage],
    outcome:record.value.outcome
      ? '본인 미검증 기록: '+record.value.outcome.result
      : null,
    synthetic:record.value.dataMode==='SYNTHETIC',
  };
}
