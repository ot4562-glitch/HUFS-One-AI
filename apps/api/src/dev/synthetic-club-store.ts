import {randomBytes} from 'node:crypto';
import {SyntheticClubAdminRecordSchema,type SyntheticClubAdminRecord} from '@hufs-one/contracts';
import {createClubRecord,editClubRecord,decideClubRecord,clubDecisionReceipt,SyntheticClubConflict,
  SYNTHETIC_CLUB_SOURCE,type TrustedSyntheticClubPublicationPort} from '../modules/opportunities/synthetic-club-publication.js';
import type {ClubProfile} from '../../../../packages/core/src/opportunities/clubs.js';
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
  private readonly records=new Map<string,SyntheticClubAdminRecord>();
  private readonly profiles=new Map<string,ClubProfile>();
  private readonly receipts=new Map<string,{actorId:string;revision:number;expires:number;asOf:string}>();
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
    private readonly clock:()=>string=()=>new Date().toISOString(),
    private readonly options:{asOf?:()=>string}={}){
    for(const post of DEMO_CLUB_POSTS)this.records.set(post.id,SyntheticClubAdminRecordSchema.parse({
      post:structuredClone(post),version:0,sourceRef:SYNTHETIC_CLUB_SOURCE,
      lastActor:{actorId:'SYNTHETIC_FIXTURE',role:'ADMIN'},asOf:DEMO_AS_OF,recordedAt:DEMO_AS_OF}));
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
      this.receipts.set(token,{actorId,revision:rev,expires:now+30_000,asOf:this.asOf()});
      return {profile:structuredClone(profile),
        posts:structuredClone([...this.records.values()].map(x=>x.post)),
        asOf:this.asOf(),receipt:token,revision:'syn-club-rev-'+rev};
    },
    revalidate:async({actorId,receipt,revision})=>{
      const claim=this.receipts.get(receipt);
      this.receipts.delete(receipt); // single use, including cross-actor attempts
      return claim!==undefined&&claim.actorId===actorId
        &&claim.revision===this.revision&&revision==='syn-club-rev-'+claim.revision
        &&this.clockMs()<claim.expires&&claim.asOf===this.asOf();
    },
  };
  private asOf():string{return this.options.asOf?.()??DEMO_AS_OF;}
  private changed():void{this.revision++;this.receipts.clear();}
  readonly publication:TrustedSyntheticClubPublicationPort={
    list:async input=>{
      if(!await input.assertCurrentAdmin())return null;
      return {mode:'SYNTHETIC_DEMO',asOf:this.asOf(),
        records:structuredClone([...this.records.values()].sort((a,b)=>a.post.id.localeCompare(b.post.id)))};
    },
    create:async input=>{
      if(this.records.has(input.postId)||this.records.size>=100)throw new SyntheticClubConflict();
      const next=createClubRecord({...input,asOf:this.asOf(),sourceRef:SYNTHETIC_CLUB_SOURCE});
      if(!await input.assertCurrentAdmin())return null;
      if(this.records.has(input.postId)||this.records.size>=100)throw new SyntheticClubConflict();
      this.records.set(input.postId,next);this.changed();
      return {record:structuredClone(next)};
    },
    edit:async input=>{
      const old=this.records.get(input.postId);if(!old)return null;
      const next=editClubRecord(old,{...input,asOf:this.asOf()});
      if(!await input.assertCurrentAdmin())return null;
      if(this.records.get(input.postId)!==old)throw new SyntheticClubConflict();
      this.records.set(input.postId,next);this.changed();
      return {record:structuredClone(next)};
    },
  };
  readonly moderation:TrustedSyntheticClubModerationPort={
    decide:async input=>{
      const old=this.records.get(input.postId);if(!old)return null;
      const next=decideClubRecord(old,{...input,asOf:this.asOf()});
      if(!await input.assertCurrentAdmin())return null;
      if(this.records.get(input.postId)!==old)throw new SyntheticClubConflict();
      this.records.set(input.postId,next);this.changed();
      return clubDecisionReceipt(next);
    },
  };
}
