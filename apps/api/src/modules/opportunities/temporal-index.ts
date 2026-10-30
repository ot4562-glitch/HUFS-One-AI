import {createHash} from 'node:crypto';
import {z} from 'zod';

const Time=z.iso.datetime({offset:true});
export const LocalSourceRevisionSchema=z.strictObject({
  revisionId:z.string().min(1),
  sourceId:z.string().min(1),
  supersedes:z.string().min(1).optional(),
  mediaKind:z.enum(['HTML','IMAGE','PDF','TEXT']),
  contentSha256:z.string().regex(/^[0-9a-f]{64}$/),
  fetchedAt:Time,
  publishedAt:Time.optional(),
  lastCheckedAt:Time,
  lastVerifiedAt:Time.optional(),
  validFrom:Time.optional(),
  validUntil:Time.optional(),
  permissionRef:z.string().min(1),
  provenance:z.enum(['SYNTHETIC','REAL_APPROVED','RESEARCH_ONLY']),
  status:z.enum(['ACTIVE','NEEDS_REVIEW','RETRACTED']),
  paragraphs:z.array(z.strictObject({
    id:z.string().min(1),
    text:z.string().min(1),
  })).max(200),
});
export type LocalSourceRevision=z.infer<typeof LocalSourceRevisionSchema>;

export const hashParagraphs=(paragraphs:LocalSourceRevision['paragraphs'])=>
  createHash('sha256').update(JSON.stringify(paragraphs)).digest('hex');

function at(value:string):number {
  const t=Date.parse(value);
  if(!Number.isFinite(t))throw new Error('Invalid ISO time');
  return t;
}
const normalize=(input:string)=>input.normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
const words=(input:string)=>normalize(input).match(/[\p{L}\p{N}]+/gu)??[];

export interface EvidenceQuery {
  query:string;
  asOf:string;
  /** Permissions come from the server's authenticated policy, never a browser query string. */
  allowedPermissionRefs:ReadonlySet<string>;
  allowedSourceIds?:ReadonlySet<string>;
  topK?:number;
}
export interface EvidenceMatch {
  sourceId:string;revisionId:string;paragraphId:string;quote:string;score:number;
}
export interface EvidenceSearch {
  state:'READY'|'NO_EVIDENCE';
  asOf:string;
  retrievalConfigVersion:'lexical-v1';
  matches:EvidenceMatch[];
}

/**
 * Local deterministic, in-memory candidate index. No network, OCR, vector DB,
 * NCP, or student data; DB migrations and shared vNext schemas remain in #18.
 */
export class LocalTemporalEvidenceIndex {
  private readonly revisions=new Map<string,LocalSourceRevision>();
  private readonly bySource=new Map<string,string[]>();

  add(value:unknown):void {
    const rev=LocalSourceRevisionSchema.parse(value);
    if(rev.contentSha256!==hashParagraphs(rev.paragraphs))
      throw new Error('Hash mismatch; refusing mutable evidence');
    if(this.revisions.has(rev.revisionId))throw new Error('Immutable revision already present');
    if(new Set(rev.paragraphs.map(p=>p.id)).size!==rev.paragraphs.length)
      throw new Error('Duplicate paragraph IDs');
    if(at(rev.lastCheckedAt)<at(rev.fetchedAt))throw new Error('lastChecked precedes fetch');
    if(rev.lastVerifiedAt&&at(rev.lastVerifiedAt)<at(rev.fetchedAt))
      throw new Error('Verification predates fetch');
    if(rev.status==='ACTIVE'&&!rev.lastVerifiedAt)
      throw new Error('ACTIVE requires an independent review timestamp');
    if(rev.validFrom&&rev.validUntil&&at(rev.validUntil)<=at(rev.validFrom))
      throw new Error('Invalid effective period');
    const previous=this.bySource.get(rev.sourceId)??[];
    const latest=previous.length?this.revisions.get(previous[previous.length-1]!)!:undefined;
    if(latest){
      if(rev.supersedes!==latest.revisionId)throw new Error('Missing previous revision link');
      if(at(rev.fetchedAt)<=at(latest.fetchedAt))throw new Error('Non-increasing source history');
    }else if(rev.supersedes){
      throw new Error('Supersedes unknown source revision');
    }
    this.revisions.set(rev.revisionId,structuredClone(rev));
    this.bySource.set(rev.sourceId,[...previous,rev.revisionId]);
  }

  search(input:EvidenceQuery):EvidenceSearch {
    const asOf=at(input.asOf),terms=words(input.query);
    const limit=input.topK??12;
    if(!Number.isInteger(limit)||limit<1||limit>12)throw new Error('topK must be 1..12');
    if(!terms.length||terms.length>20)return {state:'NO_EVIDENCE',asOf:input.asOf,retrievalConfigVersion:'lexical-v1',matches:[]};
    const found:EvidenceMatch[]=[];
    for(const [sourceId,ids] of this.bySource){
      if(input.allowedSourceIds&&!input.allowedSourceIds.has(sourceId))continue;
      // Historical replay: consider only versions available at the requested time.
      const known=ids.map(id=>this.revisions.get(id)!)
        .filter(r=>at(r.fetchedAt)<=asOf&&(!r.publishedAt||at(r.publishedAt)<=asOf));
      const current=known[known.length-1];
      // The newest revision shadows the old, even when rejected/retracted/unverified.
      if(!current||!input.allowedPermissionRefs.has(current.permissionRef)
        ||current.provenance==='RESEARCH_ONLY'||current.status!=='ACTIVE'
        ||!current.lastVerifiedAt||at(current.lastVerifiedAt)>asOf
        ||(current.validFrom&&at(current.validFrom)>asOf)
        ||(current.validUntil&&at(current.validUntil)<=asOf))continue;
      for(const paragraph of current.paragraphs){
        const normalized=normalize(paragraph.text);
        const score=terms.reduce((n,w)=>n+(normalized.includes(w)?1:0),0);
        if(!score)continue;
        found.push({sourceId,revisionId:current.revisionId,
          paragraphId:paragraph.id,quote:paragraph.text,score});
      }
    }
    found.sort((a,b)=>b.score-a.score||a.sourceId.localeCompare(b.sourceId)
      ||a.revisionId.localeCompare(b.revisionId)||a.paragraphId.localeCompare(b.paragraphId));
    const matches=found.slice(0,limit);
    return {state:matches.length?'READY':'NO_EVIDENCE',asOf:input.asOf,
      retrievalConfigVersion:'lexical-v1',matches};
  }

  size():number {return this.revisions.size;}
}
