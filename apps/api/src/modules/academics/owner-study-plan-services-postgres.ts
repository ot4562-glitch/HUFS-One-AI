import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {OwnerStudyPlanCheckResponseSchema} from '@hufs-one/contracts';
import type {OwnerStudyPlanCheckResponse} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {OwnerCatalogAuthority} from '../opportunities/owner-catalog-postgres.js';
import {canonicalProjectionHash} from '../opportunities/owner-catalog-postgres.js';
import {policyFingerprint} from '../opportunities/temporal-gateway.js';
import {PostgresOwnerStudyPlanSnapshotLoader} from './owner-study-plan-postgres.js';
import {createTrustedOwnerStudyPlanSource} from './owner-study-plan-source.js';
import type {TrustedOwnerStudyPlanSource,TrustedOwnerStudyPlanRights,ApprovedStudyPlanGate} from '../profiles/owner-study-plan-check-http.js';

export interface OwnerStudyPlanAuthority {
  /** Independent purpose permission for this owner's private plan/transcript.
   * Neither source SEARCH rights nor a browser consent checkbox grants it. */
  mayRead(input:{actorId:string;term:string;now:string}):Promise<boolean>;
}
type Input=Parameters<TrustedOwnerStudyPlanRights['mayInspect']>[0];
type Revalidate=Parameters<TrustedOwnerStudyPlanSource['revalidate']>[0];
type Ticket={actorId:string;term:string;check:OwnerStudyPlanCheckResponse;issued:number;expires:number};
const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/),Time=z.iso.datetime({offset:true});
const Term=z.string().regex(/^(19|20|21)\d{2}-[12]$/);
const instant=(value:unknown)=>Time.parse(value instanceof Date?value.toISOString():value);
const hash=canonicalProjectionHash;

/** Optional SELECT-only assembly. No network, pool, schema, approval or fixture
 * is created. Personal rights and reviewed academic activation stay independent.
 * GRANT_SCOPED needs a separate SharingGrant verifier and is not enabled here. */
export function createPostgresOwnerStudyPlanServices(options:{pool:ReviewerSqlPool;authority:OwnerCatalogAuthority;
  ownerAuthority:OwnerStudyPlanAuthority;approval:ApprovedStudyPlanGate;now?:()=>string}){
  if(typeof options.ownerAuthority?.mayRead!=='function'||typeof options.approval?.isApproved!=='function')
    throw new Error('Independent owner and academic authorities required');
  const clock=options.now??(()=>new Date().toISOString());
  const snapshots=new PostgresOwnerStudyPlanSnapshotLoader(options.pool,options.authority,clock);
  const core=createTrustedOwnerStudyPlanSource({snapshots:{load:input=>snapshots.load(input),
    revalidate:input=>snapshots.revalidateCurrent(input)}});
  const tickets=new Map<string,Ticket>();
  const rightsTickets=new Map<string,{actorId:string;sourceReceipt:string;expires:number}>();
  const cleanup=(now:number)=>{
    for(const [key,value] of tickets)if(value.expires<=now)tickets.delete(key);
    for(const [key,value] of rightsTickets)if(value.expires<=now)rightsTickets.delete(key);
    while(tickets.size>=128)tickets.delete(tickets.keys().next().value!);
    while(rightsTickets.size>=128)rightsTickets.delete(rightsTickets.keys().next().value!);
  };
  const preflight=async(input:Input)=>{
    try{
      Ref.parse(input.actorId);Term.parse(input.term);Time.parse(input.now);
      const now=instant(clock());
      if(Date.parse(input.now)>Date.parse(now)||await options.ownerAuthority.mayRead({actorId:input.actorId,term:input.term,now})!==true)return false;
      const grants=await options.authority.resolve({actorId:input.actorId,now});
      if(!grants?.permissionRefs.size)return false;
      const policy=policyFingerprint(grants),c=await options.pool.connect();let open=false,allowed=false;
      try{
        await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true;
        await c.query("SET LOCAL statement_timeout='5s'");
        await c.query("SELECT set_config('hufs.self_actor',$1,true)",[input.actorId]);
        const consent=await c.query(`SELECT version,choices_json,updated_at FROM api_self_consents WHERE actor_id=$1
          AND choices_json->>'personalStorage'='true' AND updated_at<=LEAST($2::timestamptz,$3::timestamptz,clock_timestamp())`,[input.actorId,input.now,now]);
        const choices=consent.rows[0]?.choices_json;
        allowed=consent.rows.length===1&&!!choices&&typeof choices==='object'&&(choices as Record<string,unknown>).personalStorage===true;
        await c.query('COMMIT');open=false;
      }finally{if(open)try{await c.query('ROLLBACK');}catch{/* deny */}c.release();}
      const current=await options.authority.resolve({actorId:input.actorId,now:instant(clock())});
      return allowed&&!!current&&policyFingerprint(current)===policy
        &&await options.ownerAuthority.mayRead({actorId:input.actorId,term:input.term,now:instant(clock())})===true;
    }catch{return false;}
  };
  const ticket=(input:Revalidate)=>{
    Ref.parse(input.actorId);Time.parse(input.now);const current=Date.parse(instant(clock())),value=tickets.get(input.receipt);
    return value&&value.actorId===input.actorId&&current>=value.issued&&current<value.expires
      &&Date.parse(input.now)<=current&&Date.parse(input.now)>=Date.parse(value.check.asOf)?value:null;
  };
  const fresh=async(input:Revalidate)=>{
    try{
      const value=ticket(input);if(!value||!await preflight({actorId:input.actorId,term:value.term,now:input.now}))return null;
      if(!await core.revalidate(input)||await options.ownerAuthority.mayRead({actorId:input.actorId,term:value.term,now:instant(clock())})!==true
        ||!ticket({...input,now:instant(clock())}))return null;
      return value;
    }catch{return null;}
  };
  const source:TrustedOwnerStudyPlanSource={inspect:async input=>{
    if(!await preflight(input))throw new Error('Owner study-plan access denied');
    const result=await core.inspect(input),check=OwnerStudyPlanCheckResponseSchema.parse(result.check);
    const grants=await options.authority.resolve({actorId:input.actorId,now:instant(clock())});
    if(check.disclosure.mode==='GRANT_SCOPED'||!grants||!check.approval
      ||check.approval.sourceRightsVersion!==grants.policyVersion)throw new Error('Owner academic rights not bound');
    const issued=Date.parse(instant(clock()));cleanup(issued);
    tickets.set(result.receipt,{actorId:input.actorId,term:input.term,check:structuredClone(check),issued,expires:issued+30_000});
    if(!await fresh({actorId:input.actorId,receipt:result.receipt,now:instant(clock())})){
      tickets.delete(result.receipt);throw new Error('Owner study-plan snapshot changed');
    }
    return {check,receipt:result.receipt};
  },revalidate:async input=>!!await fresh(input)};
  const rights:TrustedOwnerStudyPlanRights={mayInspect:preflight,authorize:async input=>{
    const value=await fresh({actorId:input.actorId,receipt:input.sourceReceipt,now:input.now});
    if(!value)return {allowed:false,rightsReceipt:''};
    const check=value.check;
    const expected={term:check.term,asOf:check.asOf,planVersion:check.versions.plan??null,
      disclosureMode:check.disclosure.mode,sharingGrantVersion:check.disclosure.grantVersion??null,
      courseRefs:check.disclosure.visibleCourseRefs,evidenceLinks:check.evidenceLinks,
      evidenceRefs:[...new Set([...check.evidenceLinks.map(link=>link.evidenceRef),
        ...check.planIssues.flatMap(issue=>issue.evidenceRefs),...(check.approval?.officialEvidenceRefs??[])])].sort()};
    const actual={term:input.term,asOf:input.asOf,planVersion:input.planVersion??null,disclosureMode:input.disclosureMode,
      sharingGrantVersion:input.sharingGrantVersion??null,courseRefs:input.courseRefs,evidenceLinks:input.evidenceLinks,evidenceRefs:input.evidenceRefs};
    if(hash(expected)!==hash(actual))return {allowed:false,rightsReceipt:''};
    const rightsReceipt=randomBytes(32).toString('hex');cleanup(Date.parse(instant(clock())));
    rightsTickets.set(rightsReceipt,{actorId:input.actorId,sourceReceipt:input.sourceReceipt,expires:value.expires});
    return {allowed:true,rightsReceipt};
  },revalidate:async input=>{
    const right=rightsTickets.get(input.rightsReceipt);
    return !!right&&right.actorId===input.actorId&&right.sourceReceipt===input.sourceReceipt
      &&Date.parse(instant(clock()))<right.expires&&!!await fresh({actorId:input.actorId,receipt:input.sourceReceipt,now:input.now});
  }};
  const approvalGate:ApprovedStudyPlanGate={isApproved:async input=>{
    const value=await fresh({actorId:input.actorId,receipt:input.sourceReceipt,now:input.now});
    if(!value?.check.approval)return false;
    const check=value.check,proof=value.check.approval;
    const expected={coreVersion:proof.coreVersion,rulePackVersion:proof.rulePackVersion,sourceRightsVersion:proof.sourceRightsVersion,
      consentVersion:proof.consentVersion,term:check.term,asOf:check.asOf,approval:proof,evidenceLinks:check.evidenceLinks};
    const actual={coreVersion:input.coreVersion,rulePackVersion:input.rulePackVersion,sourceRightsVersion:input.sourceRightsVersion,
      consentVersion:input.consentVersion,term:input.term,asOf:input.asOf,approval:input.approval,evidenceLinks:input.evidenceLinks};
    if(hash(expected)!==hash(actual)||await options.approval.isApproved(structuredClone(input))!==true)return false;
    return !!await fresh({actorId:input.actorId,receipt:input.sourceReceipt,now:instant(clock())});
  }};
  return {source,rights,approvalGate};
}
