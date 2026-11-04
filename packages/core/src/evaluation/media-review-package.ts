import {canonicalJson,hashCanonical} from './canonical.js';
import {buildMediaFixturePack,type MediaImageSpan,type PosterFixture,type TemporalFixture} from './media-fixtures.js';
import type {ReviewEvidence,ReviewPackage} from './review-package.js';
export type MediaReviewEvidence=ReviewEvidence|{evidenceId:string;sourceId:string;sourceRevisionId:string;originalSha256:string;span:MediaImageSpan};
export type MediaReviewCase={caseId:string;kind:'POSTER';caseSha256:string;reference:PosterFixture;evidence:MediaReviewEvidence[]}|
  {caseId:string;kind:'TEMPORAL';caseSha256:string;reference:TemporalFixture;evidence:MediaReviewEvidence[]};
export interface MediaReviewPackage {
  schemaVersion:'independent-review-package-v1';gateId:'D01';datasetKind:'MEDIA_TEMPORAL';datasetId:'syn-media-time-v1';
  demoAsOf:string;targetCommit:string;creatorRefs:string[];corpusSha256:string;packageSha256:string;
  sourceKind:'SYNTHETIC';independentGoldReview:'PENDING';cases:MediaReviewCase[];
}
export function buildMediaReviewPackage(input:{targetCommit:string}):MediaReviewPackage{
  if(!/^[a-f0-9]{40}$/.test(input.targetCommit))throw new Error('Exact target commit required');
  const {manifest}=buildMediaFixturePack();
  const posterCases:MediaReviewCase[]=manifest.posters.map(p=>{
    const evidence:MediaReviewEvidence[]=p.fields.map(f=>({evidenceId:f.evidenceId,sourceId:p.sourceId,
      sourceRevisionId:p.image.revisionId,originalSha256:p.image.originalSha256,span:structuredClone(f.imageSpan)}));
    const c={caseId:p.id,kind:'POSTER' as const,reference:p,evidence};return{...c,caseSha256:hashCanonical(c)};
  });
  const temporalCases:MediaReviewCase[]=manifest.temporalCases.map(t=>{
    const evidence:MediaReviewEvidence[]=t.revisions.map(r=>({evidenceId:r.revision.revisionId+':deadline',sourceId:r.revision.sourceId,
      sourceRevisionId:r.revision.revisionId,originalSha256:r.original.sha256,span:structuredClone(r.evidence.span)}));
    const c={caseId:t.id,kind:'TEMPORAL' as const,reference:t,evidence};return{...c,caseSha256:hashCanonical(c)};
  });
  const body={schemaVersion:'independent-review-package-v1' as const,gateId:'D01' as const,datasetKind:'MEDIA_TEMPORAL' as const,
    datasetId:manifest.datasetId,demoAsOf:manifest.demoAsOf,targetCommit:input.targetCommit,
    creatorRefs:['SYSTEM:MEDIA_FIXTURE_GENERATOR','github:ot4562-glitch'],corpusSha256:manifest.manifestSha256,
    sourceKind:'SYNTHETIC' as const,independentGoldReview:'PENDING' as const,cases:[...posterCases,...temporalCases]};
  return{...body,packageSha256:hashCanonical(body)};
}
export function validateMediaReviewPackage(raw:unknown):MediaReviewPackage{
  const value=raw as Partial<MediaReviewPackage>;
  if(!value||typeof value.targetCommit!=='string')throw new Error('Invalid media review package');
  const expected=buildMediaReviewPackage({targetCommit:value.targetCommit});
  if(canonicalJson(raw)!==canonicalJson(expected))throw new Error('Stale or modified media review package');return expected;
}
export type AnyReviewPackage=ReviewPackage|MediaReviewPackage;
