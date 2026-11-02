import {randomBytes} from 'node:crypto';
import type {ClubPost,ClubProfile} from '../../../../packages/core/src/opportunities/clubs.js';
import {DEMO_CLUB_POSTS,DEMO_CLUB_PROFILES} from '../../../../packages/core/src/opportunities/demo-clubs.js';
import {DEMO_AS_OF} from '../../../../packages/core/src/opportunities/demo-corpus.js';
import type {
  TrustedSyntheticClubReadPort,TrustedSyntheticClubModerationPort,
} from '../modules/opportunities/synthetic-clubs-http.js';

/** An EXPLICITLY INJECTED, synthetic-only, non-persistent preview provider.
 * It does not run in the production launcher and never proves school approval.
 * Actor-to-demo-subject mapping is server supplied, never a browser parameter.
 */
export class MemorySyntheticClubDemoStore {
  private readonly records=new Map<string,{post:ClubPost;version:number}>();
  private readonly profiles=new Map<string,ClubProfile>();
  private readonly receipts=new Map<string,{actorId:string;revision:number;expires:number}>();
  private revision=0;
  private static readonly MAX_OUTSTANDING_RECEIPTS=128;
  private clockMs():number{
    const time=Date.parse(this.clock());
    if(!Number.isFinite(time))throw new Error('Invalid synthetic demo clock');
    return time;
  }
  private pruneReceipts(now:number):void{
    for(const [receipt,claim] of this.receipts){
      if(claim.expires<=now)this.receipts.delete(receipt);
    }
    while(this.receipts.size>=MemorySyntheticClubDemoStore.MAX_OUTSTANDING_RECEIPTS){
      const oldest=this.receipts.keys().next().value;
      if(oldest===undefined)break;
      this.receipts.delete(oldest);
    }
  }
  constructor(actorSubjects:Readonly<Record<string,'S01'|'S02'|'S03'|'S04'|'S05'>>,
    private readonly clock:()=>string=()=>new Date().toISOString()){
    for(const post of DEMO_CLUB_POSTS)this.records.set(post.id,{post:structuredClone(post),version:0});
    for(const [actorId,subject] of Object.entries(actorSubjects)){
      const profile=DEMO_CLUB_PROFILES.find(x=>x.subject===subject)?.profile;
      if(!profile)throw new Error('Unknown synthetic subject');
      this.profiles.set(actorId,structuredClone(profile));
    }
  }
  readonly source:TrustedSyntheticClubReadPort={
    read:async({actorId})=>{
      const profile=this.profiles.get(actorId);
      if(!profile)return null;
      const now=this.clockMs();
      this.pruneReceipts(now);
      const token=randomBytes(20).toString('hex'),rev=this.revision;
      this.receipts.set(token,{actorId,revision:rev,expires:now+30_000});
      return {profile:structuredClone(profile),
        posts:structuredClone([...this.records.values()].map(x=>x.post)),
        asOf:DEMO_AS_OF,receipt:token,revision:'syn-club-rev-'+rev};
    },
    revalidate:async({actorId,receipt,revision})=>{
      const claim=this.receipts.get(receipt);
      this.receipts.delete(receipt); // single use, including cross-actor attempts
      return claim!==undefined&&claim.actorId===actorId
        &&claim.revision===this.revision&&revision==='syn-club-rev-'+claim.revision
        &&this.clockMs()<claim.expires;
    },
  };
  readonly moderation:TrustedSyntheticClubModerationPort={
    decide:async({adminActorId,postId,expectedVersion,decision,now,assertCurrentAdmin})=>{
      const old=this.records.get(postId),at=Date.parse(now);
      if(!adminActorId||!old||old.version!==expectedVersion||!Number.isFinite(at))return null;
      if(decision==='REVOKE'&&old.post.state!=='APPROVED')return null;
      if((decision==='APPROVE'||decision==='REJECT')&&old.post.state!=='REVIEW_PENDING')return null;
      if(decision==='APPROVE'&&Date.parse(old.post.updatedAt)>at)return null;
      // Recheck privileged operator *inside* the optimistic decision boundary.
      if(!await assertCurrentAdmin())return null;
      if(this.records.get(postId)!==old||old.version!==expectedVersion)return null;
      const state=decision==='APPROVE'?'APPROVED':decision==='REJECT'?'REJECTED':'REVOKED';
      const post:ClubPost={...old.post,state,...(decision==='APPROVE'?{approvedAt:now}:{})};
      this.records.set(postId,{post,version:expectedVersion+1});
      this.revision++;
      this.receipts.clear();
      return {id:postId,version:expectedVersion+1,state,mode:'SYNTHETIC_DEMO' as const,
        approvalNotice:'가상 관리자 승인(시연)' as const};
    },
  };
}
