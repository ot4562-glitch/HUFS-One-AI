import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {OpportunityCatalogDetailSchema,OwnerFeedResponseSchema,SelfProfileSchema,TopicCodeSchema} from '@hufs-one/contracts';
import type {OpportunityExplanationResponse} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {PostgresApprovedOwnerReader,canonicalProjectionHash} from './owner-catalog-postgres.js';
import type {OwnerCatalogAuthority,ApprovedOwnerProjection} from './owner-catalog-postgres.js';
import {policyFingerprint} from './temporal-gateway.js';
import type {CurrentEvidenceGrants} from './temporal-gateway.js';
import type {RecommendationProfile} from '../../../../../packages/core/src/opportunities/evaluate.js';
import {computeOwnerRecommendations,OWNER_RECOMMENDATION_CORE_VERSION,OwnerRecommendationVersionConflict} from './owner-recommendations.js';
import {projectOpportunityExplanation} from './opportunity-explanation-projection.js';
import type {TrustedOwnerFeedSource,ApprovedOwnerRecommendationGate,OwnerRecommendationAuthority} from './owner-feed-http.js';
import type {TrustedOpportunityExplanationSource,TrustedOpportunityExplanationRights,ApprovedOpportunityExplanationGate} from './opportunity-explanation-http.js';
import {DEFAULT_RANK_CONFIG} from '../../../../../packages/core/src/opportunities/rank.js';

const Time=z.iso.datetime({offset:true}),Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/);
const time=(value:unknown)=>Time.parse(value instanceof Date?value.toISOString():value);
const integer=(value:unknown)=>z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(Number(value));
const record=(value:unknown)=>z.record(z.string(),z.unknown()).parse(value);
type FeedInput=Parameters<TrustedOwnerFeedSource['inspect']>[0];
type ExplanationInput=Parameters<TrustedOpportunityExplanationSource['inspect']>[0];
type GateInput=Parameters<ApprovedOwnerRecommendationGate['isApproved']>[0];
type Ticket={actorId:string;asOf:string;fingerprint:string;issued:number;expires:number;
  kind:'FEED'|'EXPLANATION';explanation?:OpportunityExplanationResponse};
type Right={actorId:string;sourceReceipt:string;expires:number};
/** Current independently verified ACTOR facts. Never union source document
 * scopes into student facts, or turn self-selected experience topics into them. */
function ownerFacts(scope:CurrentEvidenceGrants):RecommendationProfile['facts']{
  const facts:Record<string,string|number|string[]>={};
  if(scope.campus!==undefined)facts.campus=scope.campus;
  if(scope.cohort!==undefined)facts.cohort=scope.cohort;
  if(scope.enrollmentState!==undefined)facts.enrollment=scope.enrollmentState;
  const majors=[...new Set([...(scope.majorCode?[scope.majorCode]:[]),...(scope.majors?.map(value=>value.code)??[])])];
  if(majors.length)facts.major=majors;
  return facts;
}

function detail(projection:ApprovedOwnerProjection){
  const value=OpportunityCatalogDetailSchema.parse(projection.payload_json),source=value.source;
  if(projection.entity_id!==value.opportunity.id||source.revisionId!==value.opportunity.sourceSnapshotId||
    !projection.sources_json.some(ref=>ref.sourceId===source.sourceId&&ref.revisionId===source.revisionId&&ref.permissionRef===source.permissionRef))
    throw new Error('Owner recommendation catalog binding mismatch');
  return value;
}

/** Own-account, SELECT-only input adapter. Reuses the existing independently
 * approved catalog reader and current owner tables, never a demo subject or
 * precomputed ranking. Every disclosure re-reads the same fingerprint. */
class PostgresOwnerRecommendations {
  private readonly reader:PostgresApprovedOwnerReader;
  private readonly tickets=new Map<string,Ticket>();
  private readonly rightsTickets=new Map<string,Right>();
  constructor(private readonly pool:ReviewerSqlPool,private readonly authority:OwnerCatalogAuthority,
    private readonly gate:ApprovedOwnerRecommendationGate,private readonly ownerAuthority:OwnerRecommendationAuthority,
    private readonly clock:()=>string){
    if(typeof gate?.isApproved!=='function')throw new Error('Independent recommendation approval required');
    if(typeof ownerAuthority?.mayRead!=='function')throw new Error('Independent owner input access required');
    this.reader=new PostgresApprovedOwnerReader(pool,authority,clock);
  }
  private cleanup(now:number){
    for(const [key,value] of this.tickets)if(value.expires<=now)this.tickets.delete(key);
    for(const [key,value] of this.rightsTickets)if(value.expires<=now)this.rightsTickets.delete(key);
    while(this.tickets.size>=128)this.tickets.delete(this.tickets.keys().next().value!);
    while(this.rightsTickets.size>=128)this.rightsTickets.delete(this.rightsTickets.keys().next().value!);
  }
  private async mayRead(input:FeedInput):Promise<boolean>{
    try{
      Ref.parse(input.actorId);Time.parse(input.asOf);Time.parse(input.now);
      const clock=time(this.clock());
      if(Date.parse(input.asOf)>Date.parse(input.now)||Date.parse(input.now)>Date.parse(clock)
        ||await this.ownerAuthority.mayRead({actorId:input.actorId,now:clock})!==true)return false;
      const c=await this.pool.connect();let open=false,allowed=false;
      try{
        await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true;
        await c.query("SET LOCAL statement_timeout='5s'");
        await c.query("SELECT set_config('hufs.self_actor',$1,true)",[input.actorId]);
        const consent=await c.query(`SELECT version,choices_json,updated_at FROM api_self_consents WHERE actor_id=$1
          AND choices_json->>'personalStorage'='true' AND updated_at<=LEAST($2::timestamptz,clock_timestamp())`,[input.actorId,clock]);
        allowed=consent.rows.length===1&&!!consent.rows[0]?.choices_json&&typeof consent.rows[0].choices_json==='object'
          &&(consent.rows[0].choices_json as Record<string,unknown>).personalStorage===true;
        await c.query('COMMIT');open=false;
      }finally{if(open)try{await c.query('ROLLBACK');}catch{/* deny */}c.release();}
      return allowed&&await this.ownerAuthority.mayRead({actorId:input.actorId,now:time(this.clock())})===true;
    }catch{return false;}
  }
  private async read(input:FeedInput){
    Ref.parse(input.actorId);Time.parse(input.asOf);Time.parse(input.now);
    if(Date.parse(input.asOf)>Date.parse(input.now))return null;
    if(!await this.mayRead(input))return null;
    const scope=await this.authority.resolve({actorId:input.actorId,now:input.now});
    if(!scope?.permissionRefs.size)return null;
    const policy=policyFingerprint(scope);
    const value=await this.reader.read({actorId:input.actorId,kind:'OPPORTUNITY',asOf:input.asOf},input.now,async(c,rows)=>{
      const parsed=rows.map(detail),ids=[...new Set(parsed.map(item=>item.source.revisionId))];
      const profile=await c.query(`SELECT version,profile_json,updated_at FROM api_self_profiles WHERE actor_id=$1 LIMIT 2`,[input.actorId]);
      const approvals=await c.query(`SELECT a.actor_id,a.experience_id,a.version,a.content_version,a.consent_version,a.topics,
        a.state,a.provenance,a.approved_at,a.updated_at,r.actor_id AS record_actor_id,r.version AS record_version,
        r.kind AS record_kind,r.value_json->>'dataMode' AS record_data_mode,r.value_json->>'state' AS record_state,
        r.updated_at AS record_updated_at,r.deleted_at AS record_deleted_at
        FROM api_experience_tag_approvals a JOIN api_self_workspace_records r
          ON r.actor_id=a.actor_id AND r.kind='EXPERIENCE' AND r.item_id=a.experience_id
        WHERE a.actor_id=$1 AND a.state='ACTIVE' AND r.deleted_at IS NULL
        ORDER BY a.experience_id COLLATE "C" LIMIT 201`,[input.actorId]);
      const published=ids.length?await c.query(`SELECT revision_id,published_at FROM source_effective_revisions_vnext
        WHERE revision_id=ANY($1::text[]) ORDER BY revision_id COLLATE "C"`,[ids]):{rows:[]};
      if(profile.rows.length>1||approvals.rows.length>200||published.rows.length>500)throw new Error('Owner input read exceeds bound');
      return {profile:profile.rows,approvals:approvals.rows,published:published.rows};
    });
    if(!value||await this.ownerAuthority.mayRead({actorId:input.actorId,now:time(this.clock())})!==true)return null;
    const currentScope=await this.authority.resolve({actorId:input.actorId,now:time(this.clock())});
    if(!currentScope||policyFingerprint(currentScope)!==policy)return null;
    const extra=z.object({profile:z.array(z.unknown()).max(1),approvals:z.array(z.unknown()).max(200),published:z.array(z.unknown()).max(500)}).parse(value.extra);
    const raw=extra.profile[0]===undefined?null:record(extra.profile[0]);
    const profile=raw?SelfProfileSchema.parse({version:integer(raw.version),value:raw.profile_json,updatedAt:time(raw.updated_at)}):null;
    if(profile&&Date.parse(profile.updatedAt)>Date.parse(input.asOf))throw new OwnerRecommendationVersionConflict();
    const approved=new Set<z.infer<typeof TopicCodeSchema>>();
    for(const unknown of extra.approvals){
      const a=record(unknown);
      if(a.actor_id!==input.actorId||a.record_actor_id!==input.actorId)throw new Error('Owner approval actor mismatch');
      if(a.state!=='ACTIVE'||a.provenance!=='LOCAL_USER_SELECTION'||a.record_kind!=='EXPERIENCE'||a.record_data_mode!=='OWNER_CONSENTED'
        ||!['DRAFT','SELF_REPORTED'].includes(String(a.record_state))||a.record_deleted_at!==null
        ||integer(a.content_version)!==integer(a.record_version)||integer(a.consent_version)!==integer(value.consentVersion))continue;
      if([a.approved_at,a.updated_at,a.record_updated_at].some(value=>Date.parse(time(value))>Date.parse(input.asOf)))continue;
      const topics=TopicCodeSchema.array().min(1).max(5).parse(a.topics);
      if(new Set(topics).size!==topics.length)throw new Error('Ambiguous approved experience topics');
      for(const topic of topics)approved.add(topic);
    }
    const publishedAtBySnapshotId:Record<string,string|undefined>={};
    for(const unknown of extra.published){
      const row=record(unknown),id=Ref.parse(row.revision_id);
      if(Object.hasOwn(publishedAtBySnapshotId,id))throw new Error('Ambiguous publication metadata');
      publishedAtBySnapshotId[id]=row.published_at===null?undefined:time(row.published_at);
    }
    const candidates=value.rows.map(detail);
    const computed=computeOwnerRecommendations({asOf:input.asOf,interestTopics:profile?.value.interestTopics??[],
      desiredJobTopics:profile?.value.desiredJobTopics??[],approvedExperienceTopics:[...approved].sort(),
      verifiedFacts:ownerFacts(scope),
      opportunities:candidates.map(item=>item.opportunity),publishedAtBySnapshotId});
    const result=OwnerFeedResponseSchema.parse({version:value.fingerprint,rankConfigVersion:computed.rankConfigVersion,feed:computed.feed});
    return {result,report:computed.report,candidates,fingerprint:value.fingerprint,validUntil:value.validUntil};
  }
  private issue(input:FeedInput,value:NonNullable<Awaited<ReturnType<PostgresOwnerRecommendations['read']>>>,
    kind:Ticket['kind'],explanation?:OpportunityExplanationResponse){
    const issued=Date.parse(time(this.clock())),expires=Math.min(issued+30_000,Date.parse(value.validUntil));
    if(issued>=expires)throw new Error('Owner recommendation snapshot expired');
    this.cleanup(issued);const receipt=randomBytes(32).toString('hex');
    this.tickets.set(receipt,{actorId:input.actorId,asOf:input.asOf,issued,expires,kind,fingerprint:value.fingerprint,
      ...(explanation?{explanation}:{} )});
    return receipt;
  }
  private ticket(actorId:string,receipt:string,now:string){
    const current=Date.parse(time(this.clock()));Time.parse(now);const value=this.tickets.get(receipt);
    return value&&value.actorId===actorId&&current>=value.issued&&current<value.expires
      &&Date.parse(now)>=Date.parse(value.asOf)&&Date.parse(now)<=current?value:null;
  }
  private async current(input:{actorId:string;receipt:string;now:string}){
    const ticket=this.ticket(input.actorId,input.receipt,input.now);if(!ticket)return null;
    const value=await this.read({actorId:input.actorId,asOf:ticket.asOf,now:input.now});
    return value&&value.fingerprint===ticket.fingerprint&&this.ticket(input.actorId,input.receipt,time(this.clock()))?{ticket,value}:null;
  }
  private async revalidate(input:{actorId:string;receipt:string;now:string}){
    try{return !!await this.current(input);}catch{return false;}
  }
  private async approved(input:GateInput,kind:Ticket['kind']){
    const ticket=this.ticket(input.actorId,input.sourceReceipt,input.now);
    if(!ticket||ticket.kind!==kind||input.coreVersion!==OWNER_RECOMMENDATION_CORE_VERSION
      ||input.rankConfigVersion!==DEFAULT_RANK_CONFIG.version||input.version!==ticket.fingerprint)return false;
    const allowed=await this.gate.isApproved(input);
    return allowed===true&&!!this.ticket(input.actorId,input.sourceReceipt,time(this.clock()));
  }
  services(){
    const feed:TrustedOwnerFeedSource={mayInspect:async input=>{
      if(!await this.mayRead(input))return false;
      const grants=await this.authority.resolve({actorId:input.actorId,now:time(this.clock())});
      return !!grants?.permissionRefs.size;
    },inspect:async input=>{
      const value=await this.read(input);if(!value)throw new Error('Owner recommendation unavailable');
      return {result:value.result,receipt:this.issue(input,value,'FEED'),coreVersion:OWNER_RECOMMENDATION_CORE_VERSION};
    },revalidate:input=>this.revalidate(input)};
    const source:TrustedOpportunityExplanationSource={inspect:async input=>{
      const value=await this.read(input);if(!value)throw new Error('Owner recommendation unavailable');
      const item=value.candidates.find(item=>item.opportunity.id===input.opportunityId);
      if(!item||item.source.revisionId!==input.sourceRevisionId)throw new Error('Owner candidate unavailable');
      const explanation=projectOpportunityExplanation(value.report,{opportunityId:input.opportunityId,
        asOf:input.asOf,sourceRevisionId:input.sourceRevisionId,rankConfigVersion:input.rankConfigVersion});
      if(!explanation)throw new Error('Owner explanation unavailable');
      return {explanation,snapshotVersion:value.fingerprint,receipt:this.issue(input,value,'EXPLANATION',explanation),coreVersion:OWNER_RECOMMENDATION_CORE_VERSION};
    },revalidate:input=>this.revalidate(input)};
    const rights:TrustedOpportunityExplanationRights={mayInspect:async input=>{
      try{
        if(!await this.mayRead(input))return false;
        if(input.rankConfigVersion!==DEFAULT_RANK_CONFIG.version)return false;
        const value=await this.reader.read({actorId:input.actorId,kind:'OPPORTUNITY',entityId:input.opportunityId,asOf:input.asOf},input.now,
          async(c,rows)=>rows.length===1?(await c.query(`SELECT revision_id,published_at FROM source_effective_revisions_vnext
            WHERE revision_id=ANY($1::text[])`,[[detail(rows[0]!).source.revisionId]])).rows:[]);
        if(!value||value.rows.length!==1||detail(value.rows[0]!).source.revisionId!==input.sourceRevisionId)return false;
        const publication=z.array(z.object({revision_id:Ref,published_at:z.unknown()})).length(1).parse(value.extra)[0]!;
        return publication.revision_id===input.sourceRevisionId&&(publication.published_at===null
          ||Date.parse(time(publication.published_at))<=Date.parse(input.asOf));
      }catch{return false;}
    },authorize:async input=>{
      const current=await this.current({actorId:input.actorId,receipt:input.sourceReceipt,now:input.now});
      if(!current||current.ticket.kind!=='EXPLANATION'||canonicalProjectionHash(current.ticket.explanation)!==canonicalProjectionHash(input.explanation))return {allowed:false,receipt:''};
      const receipt=randomBytes(32).toString('hex');this.cleanup(Date.parse(time(this.clock())));
      this.rightsTickets.set(receipt,{actorId:input.actorId,sourceReceipt:input.sourceReceipt,expires:current.ticket.expires});
      return {allowed:true,receipt};
    },revalidate:async input=>{
      const right=this.rightsTickets.get(input.rightsReceipt);
      return !!right&&right.actorId===input.actorId&&right.sourceReceipt===input.sourceReceipt
        &&Date.parse(time(this.clock()))<right.expires&&await this.revalidate({actorId:input.actorId,receipt:input.sourceReceipt,now:input.now});
    }};
    const approval:ApprovedOpportunityExplanationGate={isApproved:async input=>{
      const ticket=this.ticket(input.actorId,input.sourceReceipt,input.now);
      if(!ticket?.explanation||canonicalProjectionHash(ticket.explanation)!==canonicalProjectionHash(input.explanation))return false;
      return await this.approved({actorId:input.actorId,sourceReceipt:input.sourceReceipt,coreVersion:input.coreVersion,
        rankConfigVersion:input.explanation.rankConfigVersion,version:ticket.fingerprint,now:input.now},'EXPLANATION')
        &&await this.revalidate({actorId:input.actorId,receipt:input.sourceReceipt,now:time(this.clock())});
    }};
    return {ownerFeed:{source:feed,approval:{isApproved:(input:GateInput)=>this.approved(input,'FEED')}},opportunityExplanation:{source,rights,approval}};
  }
}

/** No SQL, timers, credentials or default activation on construction. */
export function createPostgresOwnerRecommendations(options:{pool:ReviewerSqlPool;authority:OwnerCatalogAuthority;
  ownerAuthority:OwnerRecommendationAuthority;approval:ApprovedOwnerRecommendationGate;now?:()=>string}){
  return new PostgresOwnerRecommendations(options.pool,options.authority,options.approval,options.ownerAuthority,options.now??(()=>new Date().toISOString())).services();
}
