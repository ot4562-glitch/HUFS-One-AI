import {FaqCandidateSchema,FaqDocumentSchema,type FaqCandidate,type FaqDocument} from '@hufs-one/contracts';
import {exchangePolicyInEffect} from './exchange.js';
import {checkFaqCandidate} from './faq-guard.js';
import {searchFaqParagraphs} from './faq-search.js';

export interface FaqEvidence {
  citationId:string;documentId:string;revisionId:string;title:string;sourceUrl:string;
  verifiedAt:string;text:string;provenance:FaqDocument['provenance'];
}
/** Instant first, then a numeric-aware revision ID ("r10" after "r9"). Strings would misorder time offsets. */
function newer(a:FaqDocument,b:FaqDocument):boolean{
  const ta=Date.parse(a.publishedAt),tb=Date.parse(b.publishedAt);
  return ta!==tb?ta>tb:a.revisionId.localeCompare(b.revisionId,'en',{numeric:true})>0;
}
/** New revoked, blocked or expired document heads quarantine the whole document.
 * Effective dates are KST calendar days compared on the absolute `asOf` instant (same rule as #365/#385).
 * Citation IDs carry the document ID, so two documents that both use revision "r1" and paragraph "p1"
 * stay separate; an ID that still collides (repeated paragraph ID, over-long key) fails closed. */
export function retrieveFaqEvidence(question:string,raw:readonly FaqDocument[],asOf:string,limit=6):FaqEvidence[]{
  const time=Date.parse(asOf);
  if(!Number.isFinite(time)||question.trim().length<2||question.length>500)throw new RangeError('Invalid FAQ query');
  if(!Number.isInteger(limit)||limit<1||limit>8)throw new RangeError('Invalid retrieval limit');
  const docs=FaqDocumentSchema.array().max(10000).parse(raw);
  const heads=new Map<string,FaqDocument>();
  for(const doc of docs){
    if(Date.parse(doc.publishedAt)>time||Date.parse(doc.verifiedAt)>time)continue;
    const current=heads.get(doc.documentId);
    if(!current||newer(doc,current))heads.set(doc.documentId,doc);
  }
  const paragraphs=new Map<string,FaqEvidence>();
  for(const doc of heads.values()){
    if(doc.rights!=='APPROVED'||!exchangePolicyInEffect(doc,asOf))continue;
    for(const p of doc.paragraphs){
      const citationId=doc.documentId+':'+doc.revisionId+':'+p.id;
      if(paragraphs.has(citationId)||citationId.length>120)throw new RangeError('Ambiguous FAQ citation ID');
      paragraphs.set(citationId,{citationId,documentId:doc.documentId,revisionId:doc.revisionId,title:doc.title,
        sourceUrl:doc.sourceUrl,verifiedAt:doc.verifiedAt,text:p.text,provenance:doc.provenance});
    }
  }
  const hits=searchFaqParagraphs(question,[...paragraphs.values()].map(e=>({key:e.citationId,title:e.title,text:e.text})),{limit});
  const evidence=hits.map(h=>paragraphs.get(h.key)!);
  // A synthetic fixture next to an approved school source is a configuration error, not an answer.
  if(new Set(evidence.map(e=>e.provenance)).size>1)throw new RangeError('Mixed synthetic and real FAQ evidence');
  return evidence;
}
/** This is a candidate, never a certified official answer. Accept only current evidence-bound IDs and excerpts. */
export function validateFaqCandidate(raw:unknown,evidence:readonly FaqEvidence[]):FaqCandidate{
  const candidate=FaqCandidateSchema.parse(raw);
  const reasons=checkFaqCandidate(candidate,evidence);
  if(reasons.length)throw new RangeError('FAQ candidate rejected: '+reasons.join(','));
  return candidate;
}
