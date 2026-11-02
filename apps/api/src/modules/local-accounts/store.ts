import {randomBytes} from 'node:crypto';
import {LocalAccountIdSchema,LocalAccountProfileSchema,LocalAccountWorkspaceSchema,LocalAccountSessionSchema,
  LocalAccountSnapshotSchema,type LocalAccountId,type LocalAccountProfile,type LocalAccountWorkspace,
  type LocalAccountSession,type LocalAccountSnapshot} from '@hufs-one/contracts';
import {composeFeed} from '../../../../../packages/core/src/opportunities/feed.js';
import {composeClubBoard,type RankedClub} from '../../../../../packages/core/src/opportunities/clubs.js';
import {DEMO_AS_OF,DEMO_OPPORTUNITIES,DEMO_PUBLISHED_AT} from '../../../../../packages/core/src/opportunities/demo-corpus.js';
import {DEMO_CLUB_POSTS} from '../../../../../packages/core/src/opportunities/demo-clubs.js';
import {composeNotices,type NoticeStudent} from '../../../../../packages/core/src/notices/notice.js';
import {DEMO_NOTICES} from '../../../../../packages/core/src/notices/demo-notices.js';

export class LocalAccountError extends Error {
  constructor(readonly status:number,readonly code:string,readonly revision?:number){super(code);}
}
interface Account {profile:LocalAccountProfile;workspace:LocalAccountWorkspace;revision:number}
export interface LocalAccountActor {sessionId:string;csrfToken:string;accountId:LocalAccountId;expiresAt:number}
export interface LocalAccountComputation {
  sessionId:string;accountId:LocalAccountId;revision:number;profile:LocalAccountProfile;workspace:LocalAccountWorkspace;
}
export const blankLocalAccountProfile=():LocalAccountProfile=>({displayName:'빈 데모 계정',primaryMajor:null,
  doubleMajorStatus:'UNSET',doubleMajor:null,earnedCredits:null,interestTopics:[],desiredJobTopics:[],campus:null,cohort:null});
export const blankLocalAccountWorkspace=():LocalAccountWorkspace=>({bookmarks:[],experiences:[],planCourseIds:[],search:'',notifications:false});
/** These invented fixture choices are unrelated to real owners, their intake or the S01–S05 corpus. */
function initialProfile(id:LocalAccountId):LocalAccountProfile {
  const blank=blankLocalAccountProfile();
  switch(id){
    case 'BLANK_DEMO':return blank;
    case 'SYN_OWNER_1':return {...blank,displayName:'합성 소유자 1',primaryMajor:'가상 정보학',interestTopics:['CYBERSECURITY','CLOUD_INFRA'],desiredJobTopics:['SOFTWARE_DEV'],campus:'GLOBAL',cohort:2025};
    case 'SYN_OWNER_2':return {...blank,displayName:'합성 소유자 2',primaryMajor:'가상 문화학',doubleMajorStatus:'NONE',interestTopics:['CULTURE_TOURISM','LANGUAGE_TRANSLATION'],desiredJobTopics:['EDUCATION_TUTORING'],campus:'SEOUL',cohort:2024};
    case 'SYN_OWNER_3':return {...blank,displayName:'합성 소유자 3',primaryMajor:'가상 경영학',doubleMajorStatus:'SELECTED',doubleMajor:'가상 환경학',interestTopics:['STARTUP_ENTREPRENEUR','ESG_SUSTAINABILITY'],desiredJobTopics:['CONSULTING_STRATEGY'],campus:'GLOBAL',cohort:2023};
    case 'SYN_OWNER_4':return {...blank,displayName:'합성 소유자 4',primaryMajor:'가상 경제학',doubleMajorStatus:'NONE',earnedCredits:0,interestTopics:['FINANCE_INVESTMENT','ECONOMIC_RESEARCH'],desiredJobTopics:['ACCOUNTING_TAX'],campus:'SEOUL',cohort:2025};
  }
}

/** Every call runs the maintained pure cores against one shared invented source corpus. No per-account result cache. */
export function recomputeLocalAccount(input:LocalAccountComputation):LocalAccountSnapshot {
  const p=input.profile;
  // Self-entered credit totals / majors do not prove eligibility or an approved major-topic mapping.
  // Draft experience tags are stored but are not silently upgraded to approved recommendation signals.
  const feed=composeFeed({interestTopics:p.interestTopics,desiredJobTopics:p.desiredJobTopics,
    approvedExperienceTopics:[],approvedLanguageCodes:[],officialMajorTopics:[],facts:{}},DEMO_OPPORTUNITIES,
  {asOf:DEMO_AS_OF,publishedAtBySnapshotId:DEMO_PUBLISHED_AT});
  const student:NoticeStudent={openRequirementIds:null,courseIds:[],interestTopics:p.interestTopics};
  if(p.campus!==null)student.campus=p.campus;
  if(p.cohort!==null)student.cohort=p.cohort;
  if(p.primaryMajor!==null)student.majors=[{major:p.primaryMajor,role:'PRIMARY'},
    ...(p.doubleMajorStatus==='SELECTED'&&p.doubleMajor!==null?[{major:p.doubleMajor,role:'DOUBLE' as const}]:[])];
  const notices=composeNotices(student,DEMO_NOTICES,{asOf:DEMO_AS_OF});
  const clubs=composeClubBoard({interestTopics:p.interestTopics,approvedExperienceTopics:[],desiredActivities:[],facts:{},
    ...(p.campus===null?{}:{campus:p.campus})},DEMO_CLUB_POSTS,{asOf:DEMO_AS_OF});
  const club=(item:RankedClub)=>({id:item.post.id,title:item.post.clubName,summary:item.post.summary,
    eligibility:item.eligibility,lifecycle:item.lifecycle,score:item.score.total,reasons:item.reasons.map(r=>r.text),
    topics:[...item.post.topicCodes],dataMode:'SYNTHETIC' as const});
  const unknown={state:'UNKNOWN' as const,reason:'검증된 성적표·학칙 RulePack·개설과목 근거가 없어 공식 학업·졸업 판정은 확인 필요합니다.'};
  return LocalAccountSnapshotSchema.parse({...input,mode:'SYNTHETIC',asOf:DEMO_AS_OF,feed:feed.feed,
    notices:notices.result,clubs:{recommended:clubs.recommended.map(club),all:clubs.all.map(club)},
    academics:unknown,forecast:unknown});
}

/** Process-local synthetic state shared across tabs/sessions. No filesystem, real identities or provider calls. */
export class LocalAccountStore {
  private readonly accounts=new Map<LocalAccountId,Account>();
  private readonly sessions=new Map<string,LocalAccountActor>();
  private readonly now:()=>number;
  private readonly compute:(input:LocalAccountComputation)=>LocalAccountSnapshot|Promise<LocalAccountSnapshot>;
  constructor(options:{now?:()=>number;compute?:(input:LocalAccountComputation)=>LocalAccountSnapshot|Promise<LocalAccountSnapshot>}={}){
    this.now=options.now??Date.now;this.compute=options.compute??recomputeLocalAccount;
    for(const id of LocalAccountIdSchema.options)this.accounts.set(id,{profile:LocalAccountProfileSchema.parse(initialProfile(id)),workspace:blankLocalAccountWorkspace(),revision:0});
  }
  private token(){return randomBytes(32).toString('hex');}
  private sweep(){for(const [id,actor] of this.sessions)if(actor.expiresAt<=this.now())this.sessions.delete(id);}
  createSession(accountId:LocalAccountId='BLANK_DEMO'):LocalAccountActor {
    this.sweep();if(this.sessions.size>=1000)throw new LocalAccountError(429,'SESSION_LIMIT');
    const actor={sessionId:this.token(),csrfToken:this.token(),accountId:LocalAccountIdSchema.parse(accountId),expiresAt:this.now()+8*60*60*1000};
    this.sessions.set(actor.sessionId,actor);return {...actor};
  }
  actor(sessionId:string|undefined):LocalAccountActor {
    const actor=sessionId?this.sessions.get(sessionId):undefined;
    if(!actor||actor.expiresAt<=this.now()){
      if(sessionId)this.sessions.delete(sessionId);
      throw new LocalAccountError(401,'SESSION_REQUIRED');
    }
    return {...actor};
  }
  revoke(sessionId:string){this.sessions.delete(sessionId);}
  switchSession(actor:LocalAccountActor,accountId:LocalAccountId){
    this.assertCurrent(actor);const next=this.createSession(accountId);this.revoke(actor.sessionId);return next;
  }
  session(actor:LocalAccountActor):LocalAccountSession {
    this.assertCurrent(actor);
    return LocalAccountSessionSchema.parse({mode:'SYNTHETIC',sessionId:actor.sessionId,csrfToken:actor.csrfToken,
      accountId:actor.accountId,accounts:LocalAccountIdSchema.options.map(id=>({accountId:id,
        label:id==='BLANK_DEMO'?'빈 데모 계정 (합성)':`합성 소유자 ${id.slice(-1)} (가상 인물)`,
        resettable:id==='BLANK_DEMO',dataMode:'SYNTHETIC'}))});
  }
  assertCurrent(actor:LocalAccountActor,revision?:number){
    const current=this.actor(actor.sessionId);
    if(current.accountId!==actor.accountId||current.csrfToken!==actor.csrfToken)throw new LocalAccountError(401,'SESSION_REQUIRED');
    const account=this.accounts.get(current.accountId)!;
    if(revision!==undefined&&account.revision!==revision)throw new LocalAccountError(409,'REVISION_CONFLICT',account.revision);
    return account;
  }
  async snapshot(actor:LocalAccountActor):Promise<LocalAccountSnapshot>{
    const account=this.assertCurrent(actor),revision=account.revision;
    const result=LocalAccountSnapshotSchema.parse(await this.compute({sessionId:actor.sessionId,accountId:actor.accountId,
      revision,profile:structuredClone(account.profile),workspace:structuredClone(account.workspace)}));
    // Awaited computation may race with reset, another tab's write, expiry, logout or account switching.
    this.assertCurrent(actor,revision);
    if(result.sessionId!==actor.sessionId||result.accountId!==actor.accountId||result.revision!==revision)
      throw new LocalAccountError(409,'STALE_COMPUTATION',this.assertCurrent(actor).revision);
    return result;
  }
  private next(actor:LocalAccountActor,expectedRevision:number){
    const account=this.assertCurrent(actor,expectedRevision);
    if(account.revision>=Number.MAX_SAFE_INTEGER-1)throw new LocalAccountError(409,'REVISION_EXHAUSTED',account.revision);
    return account;
  }
  async putProfile(actor:LocalAccountActor,expectedRevision:number,profile:LocalAccountProfile){
    const parsed=LocalAccountProfileSchema.parse(profile),account=this.next(actor,expectedRevision);
    account.profile=parsed;account.revision++;return this.snapshot(actor);
  }
  async putWorkspace(actor:LocalAccountActor,expectedRevision:number,workspace:LocalAccountWorkspace){
    const parsed=LocalAccountWorkspaceSchema.parse(workspace),account=this.next(actor,expectedRevision);
    account.workspace=parsed;account.revision++;return this.snapshot(actor);
  }
  async reset(actor:LocalAccountActor,expectedRevision:number){
    this.assertCurrent(actor);if(actor.accountId!=='BLANK_DEMO')throw new LocalAccountError(403,'RESET_FORBIDDEN');
    const account=this.next(actor,expectedRevision);
    account.profile=blankLocalAccountProfile();account.workspace=blankLocalAccountWorkspace();account.revision++;
    return this.snapshot(actor);
  }
}
