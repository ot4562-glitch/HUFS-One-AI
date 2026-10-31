import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {DemoProfileOption, DemoSnapshot, SubjectAlias} from '@hufs-one/contracts';

/**
 * Enrollment is one-time PER ACCOUNT, not one-time website access.
 * The person may sign in repeatedly with the same authenticated identity until endsAt.
 * No raw token is persisted; a leaked invitation cannot grant access to another email/sub.
 */
const Iso=z.iso.datetime({offset:true});
const Email=z.email().max(254).transform(v=>v.trim().toLowerCase());
export const ReviewerInviteSpecSchema=z.strictObject({
  recipientEmail:Email,
  startsAt:Iso,
  endsAt:Iso,
  label:z.string().trim().min(1).max(100),
});
export type ReviewerInviteSpec=z.input<typeof ReviewerInviteSpecSchema>;
export const ReviewerRecordSchema=z.strictObject({
  id:z.string().min(1),
  recipientEmail:Email,
  startsAt:Iso,
  endsAt:Iso,
  label:z.string().min(1),
  tokenDigest:z.string().regex(/^[0-9a-f]{64}$/),
  issuedAt:Iso,
  enrolledActorId:z.string().min(1).optional(),
  enrolledAt:Iso.optional(),
  revokedAt:Iso.optional(),
});
export type ReviewerRecord=z.output<typeof ReviewerRecordSchema>;
export interface ReviewerGrant {
  inviteId:string;
  actorId:string;
  recipientEmail:string;
  startsAt:string;
  endsAt:string;
  label:string;
}
export interface ReviewerDemoRepository {
  listProfiles():Promise<DemoProfileOption[]>;
  readSnapshot(subject:SubjectAlias):Promise<DemoSnapshot|null>;
}
export interface ReviewerAccessStore {
  /**
   * The issuance API is admin-only and is NOT exposed by a public web route.
   * In production, implement atomic database transactions with unique digest and grants.
   */
  saveIssued(record:ReviewerRecord):Promise<void>;
  redeem(input:{tokenDigest:string;actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null>;
  readActive(input:{actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null>;
  revoke(inviteId:string,now:string):Promise<boolean>;
}
const toEpoch=(value:string)=>Date.parse(value);
export const normalizeReviewerEmail=(value:string):string=>Email.parse(value);
export const digestInviteToken=(token:string):string=>
  createHash('sha256').update(token,'utf8').digest('hex');

const toGrant=(v:ReviewerRecord):ReviewerGrant=>({
  inviteId:v.id,actorId:v.enrolledActorId!,
  recipientEmail:v.recipientEmail,startsAt:v.startsAt,endsAt:v.endsAt,label:v.label,
});
const validWindow=(v:ReviewerRecord,now:string)=>!v.revokedAt
  && toEpoch(v.startsAt)<=toEpoch(now)&&toEpoch(now)<toEpoch(v.endsAt);

/**
 * Call from a restricted operator script after verifying the recipient/email/window.
 * Treat the returned token as a secret. Never publish it in GitHub, CI, logs or query strings.
 * The invitation PDF in the repo is an INACTIVE TEMPLATE with NO token.
 */
export async function issueReviewerInvitation(
  store:ReviewerAccessStore,
  spec:ReviewerInviteSpec,
  options:{now:string;id?:string;randomToken?:()=>string},
):Promise<{invitationId:string;enrollmentCode:string;startsAt:string;endsAt:string;recipientEmail:string}> {
  const parsed=ReviewerInviteSpecSchema.parse(spec);
  const now=Iso.parse(options.now);
  const start=toEpoch(parsed.startsAt),end=toEpoch(parsed.endsAt),created=toEpoch(now);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end ||end<=created)
    throw new Error('Invalid review period');
  if(end-start>45*24*60*60*1000)throw new Error('Review window exceeds 45 days');
  const enrollmentCode=(options.randomToken??(()=>randomBytes(32).toString('base64url')))();
  if(!/^[A-Za-z0-9_-]{43}$/.test(enrollmentCode))throw new Error('Secure token shape required');
  const invitationId=options.id??randomUUID();
  await store.saveIssued({
    id:invitationId,recipientEmail:parsed.recipientEmail,
    startsAt:parsed.startsAt,endsAt:parsed.endsAt,label:parsed.label,
    tokenDigest:digestInviteToken(enrollmentCode),issuedAt:now,
  });
  return {invitationId,enrollmentCode,startsAt:parsed.startsAt,
    endsAt:parsed.endsAt,recipientEmail:parsed.recipientEmail};
}

/**
 * Purely local in-memory reference implementation. Never instantiate this as the
 * production access store: production must use durable atomic persistence and
 * distributed request throttling; restart must not erase revocations.
 */
export class MemoryReviewerAccessStore implements ReviewerAccessStore {
  private readonly byId=new Map<string,ReviewerRecord>();
  private readonly byDigest=new Map<string,string>();

  async saveIssued(value:ReviewerRecord):Promise<void> {
    const r=ReviewerRecordSchema.parse(value);
    if(this.byId.has(r.id)||this.byDigest.has(r.tokenDigest))
      throw new Error('Duplicate invitation');
    this.byId.set(r.id,structuredClone(r));
    this.byDigest.set(r.tokenDigest,r.id);
  }
  async redeem(input:{tokenDigest:string;actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null> {
    const id=this.byDigest.get(input.tokenDigest);
    const r=id?this.byId.get(id):undefined;
    if(!r||!validWindow(r,input.now)||r.recipientEmail!==normalizeReviewerEmail(input.verifiedEmail))
      return null;
    if(r.enrolledActorId && r.enrolledActorId!==input.actorId)return null;
    // The token can be reused by its enrolled, email-verified owner; no visit quota.
    if(!r.enrolledActorId){
      r.enrolledActorId=input.actorId;
      r.enrolledAt=input.now;
    }
    return toGrant(r);
  }
  async readActive(input:{actorId:string;verifiedEmail:string;now:string}):Promise<ReviewerGrant|null> {
    const email=normalizeReviewerEmail(input.verifiedEmail);
    for(const r of this.byId.values()) {
      if(r.enrolledActorId===input.actorId&&r.recipientEmail===email&&validWindow(r,input.now))
        return toGrant(r);
    }
    return null;
  }
  async revoke(inviteId:string,now:string):Promise<boolean> {
    const r=this.byId.get(inviteId);
    if(!r)return false;
    r.revokedAt=Iso.parse(now);
    return true;
  }
}
