import {AcademicRulePackVNextSchema} from '@hufs-one/contracts';
export const SYNTHETIC_AS_OF='2026-11-05T00:00:00.000Z';
const date='2026-01-01T00:00:00.000Z';
/** Synthetic identities and invented rules; these are not university approval evidence. */
export function syntheticAcademicPack(){
  return AcademicRulePackVNextSchema.parse({
    version:'SYN-PACK-1',sourceDocumentVersion:'SYN-DOC-V1',
    sourceDocumentUrl:'https://synthetic.invalid/rules/primary',
    sourceDocumentSha256:'a'.repeat(64),sourcePublishedAt:date,effectiveFrom:date,
    scope:{campus:'SYN-CAMPUS',primaryMajor:'SYN-MAJOR',majorRole:'PRIMARY_MAJOR',
      admissionType:'REGULAR',curriculumVersion:'SYN-CUR-2024',cohortFrom:2024,cohortTo:2024},
    state:'APPROVED',requirements:[{id:'SYN-TOTAL',semanticKey:'total',kind:'CREDIT_TOTAL',
      requiredCreditUnits:84,sourceClauseIds:['SYN-C1'],exceptionClauseIds:[],evidenceRefs:['SYN-E1']}],
    clauseInventory:[{clauseId:'SYN-C1',kind:'RULE',sourceSpanRef:'SYN-SPAN-1',
      coverage:{state:'LINKED',requirementIds:['SYN-TOTAL']}}],
    validationReport:{checkedAt:date,sourceDocumentSha256:'a'.repeat(64),blockingIssues:[]},
    inventoryReviewedBy:'SYN-INVENTORY',approvedBy:'SYN-APPROVER',
    independentlyCheckedBy:'SYN-CHECKER',approvedAt:date,
  });
}
export function syntheticMultiDocumentPack(){
  const pack=syntheticAcademicPack();
  return {...pack,sourceDocuments:[
    {documentId:'SYN-DOC-A',url:pack.sourceDocumentUrl,version:pack.sourceDocumentVersion,
      sha256:pack.sourceDocumentSha256,publishedAt:date},
    {documentId:'SYN-DOC-B',url:'https://synthetic.invalid/rules/exception',version:'SYN-DOC-V2',
      sha256:'b'.repeat(64),publishedAt:date},
  ],requirements:pack.requirements.map(r=>({...r,exceptionClauseIds:['SYN-C2']})),
  clauseInventory:[{...pack.clauseInventory[0]!,sourceDocumentId:'SYN-DOC-A'},
    {clauseId:'SYN-C2',sourceDocumentId:'SYN-DOC-B',kind:'EXCEPTION' as const,sourceSpanRef:'SYN-SPAN-2',
      coverage:{state:'LINKED' as const,requirementIds:['SYN-TOTAL']}}],
  validationReport:{...pack.validationReport!,sourceDocumentHashes:[
    {documentId:'SYN-DOC-A',sha256:'a'.repeat(64)},{documentId:'SYN-DOC-B',sha256:'b'.repeat(64)}]}};
}
export function syntheticTrustedDocuments(){
  const pack=syntheticMultiDocumentPack();
  return {sourceDocumentSha256:pack.sourceDocumentSha256,
    sourceDocuments:pack.sourceDocuments.map(d=>({documentId:d.documentId,sourceDocumentSha256:d.sha256})),
    clauses:pack.clauseInventory.map(({clauseId,sourceDocumentId,kind,sourceSpanRef})=>({clauseId,sourceDocumentId,kind,sourceSpanRef}))};
}
export const syntheticAcademicSelection={asOf:SYNTHETIC_AS_OF,campus:'SYN-CAMPUS',primaryMajor:'SYN-MAJOR',
  majorRole:'PRIMARY_MAJOR' as const,admissionType:'REGULAR',curriculumVersion:'SYN-CUR-2024',admissionYear:2024};
