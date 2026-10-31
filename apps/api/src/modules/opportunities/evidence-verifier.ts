import {
  RetrievalEnvelopeVNextSchema,matchesTextSpan,matchesImageSpan,
} from '@hufs-one/contracts';
import type {RetrievalEnvelopeVNext,SourceSpanVNext} from '@hufs-one/contracts';

/** Verified, private server-side source metadata, never browser supplied. */
interface TrustedOriginBase {
  sourceId:string;
  revisionId:string;
  permissionRef:string;
  status:'ACTIVE'|'NEEDS_REVIEW'|'STALE'|'RETRACTED'|'BLOCKED_RIGHTS';
  sourceClass:'SYNTHETIC'|'LICENSED_EXTERNAL'|'PERSONAL_CONSENTED'|'RESEARCH_REFERENCE_ONLY';
  provenance:'SYNTHETIC'|'REAL_APPROVED'|'RESEARCH_ONLY';
  fetchedAt:string;
  lastVerifiedAt:string|null;
  publishedAt?:string;
  validFrom?:string;
  validUntil?:string;
}
export type NormalizedBbox=readonly [number,number,number,number];
export interface TrustedTextOrigin extends TrustedOriginBase {
  kind:'TEXT';
  paragraphId:string;
  text:string;
}
export interface TrustedImageOrigin extends TrustedOriginBase {
  kind:'IMAGE';
  assetId:string;
  originalSha256:string;
  transformVersion:string;
  pageCount:number;
  ocrLines:readonly {
    id:string;text:string;pageIndex:number;bboxNorm:NormalizedBbox;
  }[];
}
export type TrustedEvidenceOrigin=TrustedTextOrigin|TrustedImageOrigin;
export interface VerifiedRetrievalInput {
  retrieval:unknown;
  trustedOriginals:readonly TrustedEvidenceOrigin[];
  /** The trusted asOf latest revision for each source, including unreviewed successors. */
  latestRevisionBySource:ReadonlyMap<string,string>;
  permissionRefs:ReadonlySet<string>;
  permissionPolicyVersion:string;
  asOf:string;
}
function epoch(s:string|undefined|null):number {
  return s?Date.parse(s):NaN;
}
function eligible(item:TrustedEvidenceOrigin,input:VerifiedRetrievalInput,at:number):boolean{
  return item.status==='ACTIVE'
    &&item.sourceClass!=='RESEARCH_REFERENCE_ONLY'
    &&item.provenance!=='RESEARCH_ONLY'
    &&input.permissionRefs.has(item.permissionRef)
    &&input.latestRevisionBySource.get(item.sourceId)===item.revisionId
    &&epoch(item.fetchedAt)<=at
    &&epoch(item.lastVerifiedAt)<=at
    &&(!item.publishedAt||epoch(item.publishedAt)<=at)
    &&(!item.validFrom||epoch(item.validFrom)<=at)
    &&(!item.validUntil||epoch(item.validUntil)>at);
}
function validBox(box:NormalizedBbox):boolean{
  return box.length===4&&box.every(x=>Number.isFinite(x)&&x>=0&&x<=1)
    &&box[0]<box[2]&&box[1]<box[3];
}
function imageMatches(span:Extract<SourceSpanVNext,{kind:'IMAGE'}>,
  original:TrustedImageOrigin):boolean{
  if(!matchesImageSpan(span,{
    revisionId:original.revisionId,assetId:original.assetId,
    originalSha256:original.originalSha256,pageCount:original.pageCount,
    transformVersion:original.transformVersion,
    ocrLines:original.ocrLines.map(x=>({id:x.id,text:x.text})),
  }))return false;
  if(!validBox(span.bboxNorm))return false;
  const byId=new Map(original.ocrLines.map(x=>[x.id,x]));
  return span.ocrLineIds.every(id=>{
    const line=byId.get(id);
    if(!line||line.pageIndex!==span.pageIndex
      ||!validBox(line.bboxNorm))return false;
    const [left,top,right,bottom]=line.bboxNorm;
    const [sl,st,sr,sb]=span.bboxNorm;
    // A citation cannot point to a different page or arbitrary image region.
    return left>=sl&&top>=st&&right<=sr&&bottom<=sb;
  });
}
/**
 * Returns only revision-, scope-, time-, permission- and original-bound READY
 * evidence. Quotes are untrusted DATA; they must never be treated as instructions.
 * The caller MUST recheck live grants/source version immediately before any
 * provider request; this pure verifier performs no network or AI calls.
 */
export function verifyRetrievalForAi(
  input:VerifiedRetrievalInput,
):RetrievalEnvelopeVNext|null{
  const parsed=RetrievalEnvelopeVNextSchema.safeParse(input.retrieval);
  if(!parsed.success)return null;
  const retrieval=parsed.data,at=epoch(input.asOf);
  if(!Number.isFinite(at)||retrieval.retrievalState!=='READY'
    ||retrieval.asOf!==input.asOf
    ||retrieval.permissionPolicyVersion!==input.permissionPolicyVersion
    ||input.trustedOriginals.length>2000)return null;
  const referenced=new Set(retrieval.evidence.map(x=>x.sourceRevisionId));
  if(referenced.size!==retrieval.sourceRevisionIds.length
    ||retrieval.sourceRevisionIds.some(x=>!referenced.has(x)))return null;
  for(const span of retrieval.evidence){
    const exact=input.trustedOriginals.some(item=>{
      if(item.revisionId!==span.sourceRevisionId
        ||!eligible(item,input,at))return false;
      if(span.kind==='TEXT'){
        return item.kind==='TEXT'&&matchesTextSpan(span,{
          revisionId:item.revisionId,paragraphId:item.paragraphId,text:item.text,
        });
      }
      return item.kind==='IMAGE'&&imageMatches(span,item);
    });
    if(!exact)return null;
  }
  return retrieval;
}
