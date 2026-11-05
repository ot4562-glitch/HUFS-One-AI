import {
  SyntheticClubAdminRecordSchema,SyntheticClubContentSchema,SyntheticClubPostSchema,
  type SyntheticClubAdminRecord,type SyntheticClubContent,
} from '@hufs-one/contracts';

export class SyntheticClubDenied extends Error{constructor(){super('Synthetic club access denied');}}
export class SyntheticClubConflict extends Error{constructor(){super('Synthetic club version conflict');}}
export type ClubAdminScope={adminActorId:string;now:string;assertCurrentAdmin:()=>Promise<boolean>};
export interface TrustedSyntheticClubPublicationPort{
  list(input:ClubAdminScope):Promise<unknown>;
  create(input:ClubAdminScope&{postId:string;content:SyntheticClubContent}):Promise<unknown>;
  edit(input:ClubAdminScope&{postId:string;expectedVersion:number;content:SyntheticClubContent}):Promise<unknown>;
}
export const SYNTHETIC_CLUB_SOURCE='SYNTHETIC_CLUB_DEMO_V1';

/** Shared state transitions: never read the system clock or infer permission. */
export function createClubRecord(input:{postId:string;content:SyntheticClubContent;adminActorId:string;
  asOf:string;now:string;sourceRef:string}):SyntheticClubAdminRecord{
  const content=SyntheticClubContentSchema.parse(input.content);
  const post=SyntheticClubPostSchema.parse({...content,id:input.postId,state:'REVIEW_PENDING',
    createdAt:input.asOf,updatedAt:input.asOf});
  return SyntheticClubAdminRecordSchema.parse({post,version:1,sourceRef:input.sourceRef,
    lastActor:{actorId:input.adminActorId,role:'ADMIN'},asOf:input.asOf,recordedAt:input.now});
}
export function editClubRecord(old:SyntheticClubAdminRecord,input:{content:SyntheticClubContent;
  expectedVersion:number;adminActorId:string;asOf:string;now:string}):SyntheticClubAdminRecord{
  if(old.version!==input.expectedVersion||Date.parse(input.asOf)<Date.parse(old.post.updatedAt))
    throw new SyntheticClubConflict();
  // Even an edit at the same clock tick removes the previous approval.
  const content=SyntheticClubContentSchema.parse(input.content);
  return SyntheticClubAdminRecordSchema.parse({...old,version:old.version+1,
    post:{...content,id:old.post.id,state:'REVIEW_PENDING',createdAt:old.post.createdAt,updatedAt:input.asOf},
    lastActor:{actorId:input.adminActorId,role:'ADMIN'},asOf:input.asOf,recordedAt:input.now});
}
export function decideClubRecord(old:SyntheticClubAdminRecord,input:{expectedVersion:number;
  decision:'APPROVE'|'REJECT'|'REVOKE';adminActorId:string;asOf:string;now:string}):SyntheticClubAdminRecord{
  if(old.version!==input.expectedVersion)throw new SyntheticClubConflict();
  if(Date.parse(input.asOf)<Date.parse(old.post.updatedAt))throw new SyntheticClubConflict();
  if(input.decision==='REVOKE'?old.post.state!=='APPROVED':old.post.state!=='REVIEW_PENDING')
    throw new SyntheticClubDenied();
  const state=input.decision==='APPROVE'?'APPROVED':input.decision==='REJECT'?'REJECTED':'REVOKED';
  const {approvedAt:previousApproval,...post}=old.post;
  return SyntheticClubAdminRecordSchema.parse({...old,version:old.version+1,
    post:{...post,state,...(input.decision==='APPROVE'?{approvedAt:input.asOf}:{})},
    lastActor:{actorId:input.adminActorId,role:'ADMIN'},asOf:input.asOf,recordedAt:input.now});
}
export function clubDecisionReceipt(record:SyntheticClubAdminRecord){
  return {id:record.post.id,version:record.version,state:record.post.state,
    mode:'SYNTHETIC_DEMO' as const,approvalNotice:'가상 관리자 승인(시연)' as const};
}
