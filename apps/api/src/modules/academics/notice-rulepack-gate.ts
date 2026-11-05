import {z} from 'zod';
import {
  AcademicRulePackVNextSchema,parseApprovedAcademicRulePackVNext,
  validateAcademicNoticeRequirementRefsVNext,
  type AcademicRulePackVNext,type DemoSnapshot,
} from '@hufs-one/contracts';
import type {Notice} from '../../../../../packages/core/src/notices/notice.js';

const Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/);
/** Private, independently reviewed projection input; not an HTTP DTO. Neither
 * these strings nor an APPROVED enum manufacture genuine human/source approval. */
const Binding=z.strictObject({
  pack:AcademicRulePackVNextSchema,
  inventory:z.strictObject({
    sourceDocumentSha256:Sha,
    sourceDocuments:z.array(z.strictObject({documentId:Id,sourceDocumentSha256:Sha})).min(1).max(10).optional(),
    clauses:z.array(z.strictObject({
      clauseId:Id,kind:z.enum(['RULE','EXCEPTION','FOOTNOTE','SCOPE','PROCEDURE']),
      sourceSpanRef:Id,sourceDocumentId:Id.optional(),
    })).min(1).max(500),
  }),
  // The single-document legacy pack uses the reserved document id PRIMARY.
  sourceRevisions:z.array(z.strictObject({documentId:Id,revisionId:Id})).min(1).max(10),
});
interface Input {
  actorId:string;asOf:string;academicsShared:boolean;
  academics:DemoSnapshot['academics'];binding:unknown;
  /** These rows/IDs must come from the same current grant/rights transaction. */
  revisions:readonly Record<string,unknown>[];
  authorizedRevisionIds:readonly string[];
  notices:readonly Notice[];
}
const at=(value:unknown):number=>value instanceof Date?value.getTime()
  :typeof value==='string'?Date.parse(value):NaN;
function currentApprovedPack(input:Input):AcademicRulePackVNext|null {
  if(!input.academicsShared||!('rulePackVersion' in input.academics)
    ||!('asOf' in input.academics)||input.academics.asOf!==input.asOf)return null;
  const parsed=Binding.safeParse(input.binding);
  if(!parsed.success)return null;
  const binding=parsed.data,pack=parseApprovedAcademicRulePackVNext(binding.pack,binding.inventory);
  const asOf=at(input.asOf);
  if(!pack||!Number.isFinite(asOf)||pack.version!==input.academics.rulePackVersion
    ||pack.approvedBy===input.actorId||pack.independentlyCheckedBy===input.actorId
    ||pack.inventoryReviewedBy===input.actorId||!pack.approvedAt||!pack.validationReport
    ||at(pack.sourcePublishedAt)>asOf||at(pack.approvedAt)>asOf
    ||at(pack.validationReport.checkedAt)<at(pack.sourcePublishedAt)
    ||at(pack.effectiveFrom)>asOf||pack.effectiveUntil&&at(pack.effectiveUntil)<=asOf)return null;
  const documents=pack.sourceDocuments??[{documentId:'PRIMARY',sha256:pack.sourceDocumentSha256}];
  if(binding.sourceRevisions.length!==documents.length
    ||new Set(binding.sourceRevisions.map(x=>x.documentId)).size!==documents.length
    ||new Set(binding.sourceRevisions.map(x=>x.revisionId)).size!==documents.length)return null;
  const authorized=new Set(input.authorizedRevisionIds);
  for(const document of documents){
    const link=binding.sourceRevisions.find(x=>x.documentId===document.documentId);
    if(!link||!authorized.has(link.revisionId))return null;
    const rows=input.revisions.filter(r=>r.revision_id===link.revisionId);
    if(rows.length!==1)return null;
    const source=rows[0]!;
    if(source.status!=='ACTIVE'||source.original_sha256!==document.sha256
      ||['published_at','fetched_at','last_verified_at'].some(key=>!Number.isFinite(at(source[key]))||at(source[key])>asOf)
      ||source.valid_from!=null&&(!Number.isFinite(at(source.valid_from))||at(source.valid_from)>asOf)
      ||source.valid_until!=null&&(!Number.isFinite(at(source.valid_until))||at(source.valid_until)<=asOf))return null;
  }
  return pack;
}
/** Runs inside the real PG input consumer before notices are composed. Missing,
 * stale, unauthorized or inconsistent approval only creates a review hold; it
 * never upgrades a candidate/rejection, guesses an ID, or exposes private rules. */
export function gateAcademicNoticeReferences(input:Input):Notice[]{
  const pack=currentApprovedPack(input);
  return input.notices.map(notice=>{
    if(notice.verificationState==='REJECTED'||!notice.requirementRefs?.length)return notice;
    if(pack&&validateAcademicNoticeRequirementRefsVNext(pack,notice.requirementRefs))return notice;
    return {...notice,verificationState:'NEEDS_REVIEW'};
  });
}
