import {FaqCandidateSchema,FaqDocumentSchema,type FaqCandidate,type FaqDocument} from '@hufs-one/contracts';

export interface FaqEvidence {
  citationId:string;documentId:string;revisionId:string;title:string;sourceUrl:string;
  verifiedAt:string;text:string;
}
function words(s:string):string[]{
  return [...new Set((s.normalize('NFKC').toLocaleLowerCase('ko').match(/[\p{L}\p{N}]{2,}/gu)||[]))].slice(0,40);
}
/** New revoked, blocked or expired document heads quarantine the whole document. */
export function retrieveFaqEvidence(question:string,raw:readonly FaqDocument[],asOf:string,limit=6):FaqEvidence[]{
  const time=Date.parse(asOf);
  if(!Number.isFinite(time)||question.trim().length<2||question.length>500)throw new RangeError('Invalid FAQ query');
  if(!Number.isInteger(limit)||limit<1||limit>8)throw new RangeError('Invalid retrieval limit');
  const docs=FaqDocumentSchema.array().max(10000).parse(raw);
  const heads=new Map<string,FaqDocument>();
  for(const doc of docs){
    if(Date.parse(doc.publishedAt)>time||Date.parse(doc.verifiedAt)>time)continue;
    const current=heads.get(doc.documentId);
    if(!current||current.publishedAt<doc.publishedAt||
      (current.publishedAt===doc.publishedAt&&current.revisionId<doc.revisionId))
      heads.set(doc.documentId,doc);
  }
  const query=words(question);
  const candidates:({score:number}&FaqEvidence)[]=[];
  for(const doc of heads.values()){
    if(doc.rights!=='APPROVED'||doc.effectiveFrom>asOf.slice(0,10)||
      doc.effectiveUntil&&doc.effectiveUntil<asOf.slice(0,10))continue;
    for(const p of doc.paragraphs){
      const txt=(doc.title+' '+p.text).normalize('NFKC').toLocaleLowerCase('ko');
      const score=query.filter(w=>txt.includes(w)).length;
      if(score>0)candidates.push({score,citationId:doc.revisionId+':'+p.id,
        documentId:doc.documentId,revisionId:doc.revisionId,title:doc.title,
        sourceUrl:doc.sourceUrl,verifiedAt:doc.verifiedAt,text:p.text});
    }
  }
  return candidates.sort((a,b)=>b.score-a.score||a.citationId.localeCompare(b.citationId))
    .slice(0,limit).map(({score:_,...e})=>e);
}
/** This is a candidate, never a certified official answer. Accept only current evidence-bound IDs and excerpts. */
export function validateFaqCandidate(raw:unknown,evidence:readonly FaqEvidence[]):FaqCandidate{
  const candidate=FaqCandidateSchema.parse(raw);
  const refs=new Map(evidence.map(e=>[e.citationId,e]));
  if(refs.size!==evidence.length||new Set(candidate.citations.map(c=>c.citationId)).size!==candidate.citations.length)
    throw new RangeError('Duplicate evidence citation');
  const cited:string[]=[];
  for(const item of candidate.citations){
    const paragraph=refs.get(item.citationId);
    if(!paragraph||!paragraph.text.includes(item.quote))throw new RangeError('Unbound FAQ citation');
    cited.push(paragraph.text);
  }
  // Reject unsupported numerical assertions; proof text must contain the exact numeric token.
  const facts=cited.join(' ').match(/\d+(?:[.,]\d+)*/g)||[];
  for(const token of candidate.answer.match(/\d+(?:[.,]\d+)*/g)||[])
    if(!facts.includes(token))throw new RangeError('FAQ numeric fact lacks citation');
  if(/https?:\/\/|www\./i.test(candidate.answer))throw new RangeError('Unreviewed URL in FAQ answer');
  return candidate;
}
