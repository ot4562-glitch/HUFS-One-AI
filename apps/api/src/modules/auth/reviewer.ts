import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {AiTask,DemoProfileOption,DemoSnapshot,SafeLlmPacket,SubjectAlias} from '@hufs-one/contracts';

/**
 * ONE shared high-entropy invitation may enroll up to maxAccounts independently
 * verified Google identities. Visits remain unlimited until the UTC deadline.
 * IMPORTANT: bearer-code possession cannot prove someone is a school judge.
 * Therefore the only data accessible to this role is isolated SYNTHETIC content.
 */
const Iso=z.iso.datetime({offset:true});
const Email=z.email().max(254).transform(v=>v.trim().toLowerCase());
export const ReviewerInviteSpecSchema=z.strictObject({
  startsAt:Iso,
  endsAt:Iso,
  label:z.string().trim().min(1).max(100),
  maxAccounts:z.number().int().min(1).max(50).default(20),
});
export type ReviewerInviteSpec=z.input<typeof ReviewerInviteSpecSchema>;
export const ReviewerRecordSchema=z.strictObject({
  id:z.string().min(1),
  startsAt:Iso,endsAt:Iso,label:z.string().min(1),
  maxAccounts:z.number().int().min(1).max(50),
  tokenDigest:z.string().regex(/^[0-9a-f]{64}$/),
  issuedAt:Iso,revokedAt:Iso.optional(),
});
export type ReviewerRecord=z.output<typeof ReviewerRecordSchema>;
export const ReviewerEnrollmentSchema=z.strictObject({
  inviteId:z.string().min(1),actorId:z.string().min(1),
  verifiedEmail:Email,enrolledAt:Iso,
});
export type ReviewerEnrollment=z.output<typeof ReviewerEnrollmentSchema>;
export interface ReviewerGrant {
  inviteId:string;actorId:string;verifiedEmail:string;
  startsAt:string;endsAt:string;label:string;
}
/** Separate synthetic fixtures ONLY; production/student repositories never injected. */
export interface ReviewerDemoRepository {
  listProfiles():Promise<DemoProfileOption[]>;
  readSnapshot(subject:SubjectAlias):Promise<DemoSnapshot|null>;
  readSafePacket?(subject:SubjectAlias,task:AiTask,ref:string):Promise<SafeLlmPacket|null>;
}
export interface ReviewerAccessStore {
  saveIssued(record:ReviewerRecord):Promise<void>;
  redeem(input:{tokenDigest:string;actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null>;
  readActive(input:{actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null>;
  revoke(inviteId:string,now:string):Promise<boolean>;
}
const epoch=(value:string)=>Date.parse(value);
export const normalizeReviewerEmail=(value:string)=>Email.parse(value);
export const digestInviteToken=(token:string):string=>
  createHash('sha256').update(token,'utf8').digest('hex');
const granted=(record:ReviewerRecord,enrollment:ReviewerEnrollment):ReviewerGrant=>({
  inviteId:record.id,actorId:enrollment.actorId,verifiedEmail:enrollment.verifiedEmail,
  startsAt:record.startsAt,endsAt:record.endsAt,label:record.label,
});
const inWindow=(record:ReviewerRecord,now:string)=>!record.revokedAt
  &&epoch(record.startsAt)<=epoch(now)&&epoch(now)<epoch(record.endsAt);

/** Operator-only, no public HTTP issuance endpoint. 32 random bytes, SHA-256 at rest. */
export async function issueReviewerInvitation(
  store:ReviewerAccessStore,
  spec:ReviewerInviteSpec,
  options:{now:string;id?:string;randomToken?:()=>string},
):Promise<{invitationId:string;enrollmentCode:string;startsAt:string;endsAt:string;maxAccounts:number}> {
  const parsed=ReviewerInviteSpecSchema.parse(spec);
  const now=Iso.parse(options.now);
  const start=epoch(parsed.startsAt),end=epoch(parsed.endsAt),created=epoch(now);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||end<=created)
    throw new Error('Invalid review period');
  if(end-start>45*24*3600_000)throw new Error('Review window exceeds 45 days');
  const enrollmentCode=(options.randomToken??(()=>randomBytes(32).toString('base64url')))();
  if(!/^[A-Za-z0-9_-]{43}$/.test(enrollmentCode))throw new Error('Secure token shape required');
  const invitationId=options.id??randomUUID();
  await store.saveIssued({
    id:invitationId,startsAt:parsed.startsAt,endsAt:parsed.endsAt,
    label:parsed.label,maxAccounts:parsed.maxAccounts,
    tokenDigest:digestInviteToken(enrollmentCode),issuedAt:now,
  });
  return {invitationId,enrollmentCode,startsAt:parsed.startsAt,
    endsAt:parsed.endsAt,maxAccounts:parsed.maxAccounts};
}

/** Local-only fake. The PostgreSQL implementation locks the invitation row. */
export class MemoryReviewerAccessStore implements ReviewerAccessStore {
  private readonly invitations=new Map<string,ReviewerRecord>();
  private readonly digests=new Map<string,string>();
  private readonly members=new Map<string,Map<string,ReviewerEnrollment>>();
  async saveIssued(input:ReviewerRecord):Promise<void>{
    const r=ReviewerRecordSchema.parse(input);
    if(this.invitations.has(r.id)||this.digests.has(r.tokenDigest))
      throw new Error('Duplicate invitation');
    this.invitations.set(r.id,structuredClone(r));
    this.digests.set(r.tokenDigest,r.id);
    this.members.set(r.id,new Map());
  }
  async redeem(input:{tokenDigest:string;actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null>{
    const email=normalizeReviewerEmail(input.verifiedEmail);
    const id=this.digests.get(input.tokenDigest);
    const record=id?this.invitations.get(id):null;
    if(!record||!inWindow(record,input.now))return null;
    const members=this.members.get(record.id)!;
    const existing=members.get(input.actorId);
    if(existing)return existing.verifiedEmail===email?granted(record,existing):null;
    if(members.size>=record.maxAccounts)return null;
    const member=ReviewerEnrollmentSchema.parse({
      inviteId:record.id,actorId:input.actorId,verifiedEmail:email,enrolledAt:input.now,
    });
    members.set(input.actorId,member);
    return granted(record,member);
  }
  async readActive(input:{actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null>{
    const email=normalizeReviewerEmail(input.verifiedEmail);
    for(const [id,members] of this.members){
      const record=this.invitations.get(id)!;
      const member=members.get(input.actorId);
      if(member&&member.verifiedEmail===email&&inWindow(record,input.now))
        return granted(record,member);
    }
    return null;
  }
  async revoke(inviteId:string,now:string):Promise<boolean>{
    const item=this.invitations.get(inviteId);
    if(!item)return false;
    item.revokedAt=Iso.parse(now);
    return true;
  }
}
