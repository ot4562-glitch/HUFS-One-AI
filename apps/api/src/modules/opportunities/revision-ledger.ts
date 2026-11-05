import {createHash} from 'node:crypto';
import {
  RetrievalEnvelopeVNextSchema,RevisionInvalidationVNextSchema,
  SourceRevisionVNextSchema,SourceSpanVNextSchema,matchesTextSpan,matchesEvidenceScope,
} from '@hufs-one/contracts';
import type {
  RetrievalEnvelopeVNext,RevisionInvalidationVNext,SourceRevisionVNext,
  SourceSpanVNext,EvidenceActorScope,
} from '@hufs-one/contracts';

export type RevisionParagraph={id:string;text:string};
export type StoredRevision={
  revision:SourceRevisionVNext;
  paragraphs:RevisionParagraph[];
};
export type TemporalPolicy=EvidenceActorScope & {
  /** Trusted server-issued grants, never accepted from a browser query string. */
  permissionRefs:ReadonlySet<string>;
  sourceIds?:ReadonlySet<string>;
  /** Trusted server policy epoch; omitted only by legacy synthetic callers. */
  permissionPolicyVersion?:string;
  asOf:string;
  query:string;
  topK?:number;
};
export type TemporalResult={
  envelope:RetrievalEnvelopeVNext;
  hits:{sourceId:string;revisionId:string;paragraphId:string;quote:string;score:number;
    imageSpan?:Extract<SourceSpanVNext,{kind:'IMAGE'}>}[];
};
const LIM_PARAGRAPHS=200;
const LIM_CONTENT=500_000;
const CURRENT_VERSION='lexical-vnext-1';
export function temporalPermissionPolicyVersion(policy:TemporalPolicy):string {
  const version=policy.permissionPolicyVersion??'server-policy-v1';
  if(!/^[A-Za-z0-9_.:-]{1,128}$/.test(version))
    throw new Error('Invalid trusted permission policy version');
  return version;
}
const byCodeUnit=(a:string,b:string)=>a<b?-1:a>b?1:0;
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export function hashRevisionParagraphs(paragraphs:RevisionParagraph[]):string{
  return hash(JSON.stringify(paragraphs));
}
function time(value:string):number{
  const n=Date.parse(value);
  if(!Number.isFinite(n))throw new Error('Invalid reviewed time');
  return n;
}
function tokenize(input:string):string[]{
  return input.normalize('NFKC').toLocaleLowerCase('ko-KR').match(/[\p{L}\p{N}]+/gu)??[];
}
function matchesScope(revision:SourceRevisionVNext,policy:TemporalPolicy):boolean {
  return matchesEvidenceScope(revision.applicableScope,policy);
}

/**
 * Synthetic, in-memory reference implementation. Every revision is immutable
 * and checked observations live separately. Production requires Postgres,
 * reviewed allowlisted content bytes and transactional version invalidations.
 */
export class MemorySourceRevisionLedger {
  private readonly entries=new Map<string,StoredRevision>();
  private readonly sources=new Map<string,string[]>();
  private readonly checked=new Map<string,string>();
  private readonly events:RevisionInvalidationVNext[]=[];

  add(input:{
    revision:unknown;paragraphs:RevisionParagraph[];originalBytes:Uint8Array;
    permissionReviewed:boolean;
  }):RevisionInvalidationVNext|null {
    if(!input.permissionReviewed)throw new Error('Missing server-reviewed collection permission');
    const r=SourceRevisionVNextSchema.parse(input.revision);
    const paragraphs=input.paragraphs;
    if(!Array.isArray(paragraphs)||!paragraphs.length||paragraphs.length>LIM_PARAGRAPHS
      ||new Set(paragraphs.map(p=>p.id)).size!==paragraphs.length
      ||paragraphs.some(p=>!p.id||!p.text||p.text.length>20_000)
      ||Buffer.byteLength(JSON.stringify(paragraphs))>LIM_CONTENT
      ||!input.originalBytes.length||input.originalBytes.byteLength>LIM_CONTENT)
      throw new Error('Unsupported or oversized revision input');
    if(r.contentSha256!==hashRevisionParagraphs(paragraphs)
      ||r.originalSha256!==hash(input.originalBytes))
      throw new Error('Immutable original and paragraph SHA-256 mismatch');
    if(this.entries.has(r.revisionId))throw new Error('Immutable revision already exists');
    const chain=this.sources.get(r.sourceId)??[];
    const previous=chain.length?this.entries.get(chain[chain.length-1]!)!.revision:null;
    if(previous){
      if(r.supersedes!==previous.revisionId)throw new Error('Wrong supersedes edge');
      if(time(r.fetchedAt)<=time(previous.fetchedAt))
        throw new Error('Non-increasing source fetch history');
      if(r.status==='ACTIVE'&&r.changeKind==='CANCELLED')
        throw new Error('Invalid cancellation status');
    }else if(r.supersedes||r.changeKind!=='NEW'){
      throw new Error('First revision must be NEW');
    }
    const change=previous?RevisionInvalidationVNextSchema.parse({
      eventId:'revision:'+r.revisionId,sourceId:r.sourceId,
      previousRevisionId:previous.revisionId,newRevisionId:r.revisionId,
      changedAt:r.fetchedAt,
      reason:r.changeKind==='CANCELLED'?'CANCELLED'
        :r.changeKind==='EXTENDED'?'EXTENDED'
        :r.status==='BLOCKED_RIGHTS'?'RIGHTS_REVOKED':'CORRECTED',
      permissionPolicyVersion:r.permissionRef,
      invalidates:['RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE'],
    }):null;
    // All validation precedes any mutation.
    this.entries.set(r.revisionId,{
      revision:structuredClone(r),paragraphs:structuredClone(paragraphs),
    });
    this.sources.set(r.sourceId,[...chain,r.revisionId]);
    this.checked.set(r.sourceId,r.lastCheckedAt);
    if(change)this.events.push(change);
    return change?structuredClone(change):null;
  }

  /** HTTP 304 / identical SHA: update checked observation, never verification. */
  observeNotModified(sourceId:string,checkedAt:string):void {
    const chain=this.sources.get(sourceId);
    if(!chain?.length)throw new Error('Unknown source cannot claim 304');
    const last=this.entries.get(chain[chain.length-1]!)!.revision;
    const prev=this.checked.get(sourceId)??last.lastCheckedAt;
    if(time(checkedAt)<Math.max(time(prev),time(last.fetchedAt)))
      throw new Error('Non-monotonic check');
    this.checked.set(sourceId,checkedAt);
  }
  latest(sourceId:string):StoredRevision|null{
    const chain=this.sources.get(sourceId);
    const value=chain?.length?this.entries.get(chain[chain.length-1]!)!:null;
    return value?structuredClone(value):null;
  }
  lastChecked(sourceId:string):string|null{
    return this.checked.get(sourceId)??null;
  }
  invalidations():RevisionInvalidationVNext[]{return structuredClone(this.events);}
  size():number{return this.entries.size;}

  retrieve(input:TemporalPolicy):TemporalResult {
    const at=time(input.asOf);
    const permissionPolicyVersion=temporalPermissionPolicyVersion(input);
    const limit=input.topK??12;
    if(!Number.isInteger(limit)||limit<1||limit>12)
      throw new Error('topK must be 1..12');
    if(!input.permissionRefs.size) return this.empty(input,'NO_EVIDENCE');
    const words=tokenize(input.query);
    if(!words.length||words.length>20||input.query.length>250)
      return this.empty(input,'NO_EVIDENCE');
    const hits:TemporalResult['hits']=[];
    let stale=false,blockedRights=false,unknown=false;
    for(const [sourceId,chain] of this.sources){
      if(input.sourceIds&&!input.sourceIds.has(sourceId))continue;
      const historical=chain.map(id=>this.entries.get(id)!)
        .filter(item=>time(item.revision.fetchedAt)<=at
          &&(!item.revision.publishedAt||time(item.revision.publishedAt!)<=at));
      // Determine current revision BEFORE status/permission checks, to prevent
      // old active evidence resurfacing after a cancellation/correction.
      const latest=historical[historical.length-1];
      if(!latest)continue;
      const r=latest.revision;
      if(!input.permissionRefs.has(r.permissionRef)
        ||r.sourceClass==='RESEARCH_REFERENCE_ONLY'
        ||r.provenance==='RESEARCH_ONLY'
        ||!matchesScope(r,input))continue;
      if(r.status!=='ACTIVE'||r.changeKind==='UNKNOWN'
        ||!r.lastVerifiedAt||time(r.lastVerifiedAt)>at
        ||(r.validFrom&&time(r.validFrom)>at)
        ||(r.validUntil&&time(r.validUntil)<=at)){
        // Only report a negative state if THIS query matched a paragraph in
        // the visible source's history. Never reveal unrelated source states.
        const relevant=historical.some(v=>v.paragraphs.some(p=>{
          const text=p.text.normalize('NFKC').toLocaleLowerCase('ko-KR');
          return words.some(term=>text.includes(term));
        }));
        if(relevant){
          if(r.status==='BLOCKED_RIGHTS')blockedRights=true;
          else if(r.changeKind==='UNKNOWN')unknown=true;
          else stale=true;
        }
        continue;
      }
      for(const p of latest.paragraphs){
        const text=p.text.normalize('NFKC').toLocaleLowerCase('ko-KR');
        const score=words.reduce((acc,term)=>acc+(text.includes(term)?1:0),0);
        if(score===0)continue;
        hits.push({sourceId,revisionId:r.revisionId,
          paragraphId:p.id,quote:p.text,score});
      }
    }
    hits.sort((x,y)=>y.score-x.score||byCodeUnit(x.sourceId,y.sourceId)
      ||byCodeUnit(x.paragraphId,y.paragraphId));
    const results=hits.slice(0,limit);
    if(!results.length)return this.empty(input,blockedRights?'BLOCKED_RIGHTS'
      :unknown?'UNKNOWN':stale?'STALE':'NO_EVIDENCE');
    const evidence=results.map(x=>SourceSpanVNextSchema.parse({
      kind:'TEXT',sourceRevisionId:x.revisionId,paragraphId:x.paragraphId,
      startCodePoint:0,endCodePoint:Array.from(x.quote).length,
      quote:x.quote,
    }));
    for(let i=0;i<results.length;i++){
      const hit=results[i]!,original=this.entries.get(hit.revisionId)!.paragraphs
        .find(p=>p.id===hit.paragraphId)!;
      if(!matchesTextSpan(evidence[i]!,{
        revisionId:hit.revisionId,paragraphId:original.id,text:original.text,
      }))throw new Error('Stale/invented source span');
    }
    const sourceRevisionIds=[...new Set(results.map(x=>x.revisionId))];
    const envelope=RetrievalEnvelopeVNextSchema.parse({
      queryVersion:'query-1',asOf:input.asOf,
      sourceRevisionIds,permissionPolicyVersion,
      retrievalConfigVersion:CURRENT_VERSION,retrievalState:'READY',evidence,
    });
    return {envelope,hits:results};
  }

  private empty(input:TemporalPolicy,
    state:'NO_EVIDENCE'|'STALE'|'BLOCKED_RIGHTS'|'UNKNOWN'):TemporalResult {
    return {envelope:RetrievalEnvelopeVNextSchema.parse({
      queryVersion:'query-1',asOf:input.asOf,sourceRevisionIds:[],
      permissionPolicyVersion:temporalPermissionPolicyVersion(input),
      retrievalConfigVersion:CURRENT_VERSION,retrievalState:state,evidence:[],
    }),hits:[]};
  }
}
