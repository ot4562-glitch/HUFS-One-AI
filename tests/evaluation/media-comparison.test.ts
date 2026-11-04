import {describe,expect,it} from 'vitest';
import {buildMediaFixturePack} from '../../packages/core/src/evaluation/media-fixtures.js';
import {mediaComparisonReport,type MediaObservation} from '../../packages/core/src/evaluation/media-evaluation.js';
const pack=buildMediaFixturePack(),assets=new Map(pack.assets.map(a=>[a.path,a.bytes]));
function synthetic():MediaObservation{return {schemaVersion:'media-observation-v1',manifestSha256:pack.manifest.manifestSha256,
  observationId:'SYNTHETIC-PROTOCOL-ONLY',mode:'HTML_GENERAL_OCR',provenance:'SYNTHETIC_PROTOCOL',
  records:pack.manifest.posters.map(p=>({posterId:p.id,imageSha256:p.image.originalSha256,htmlSha256:p.html.originalSha256,
    latencyMs:1,inputTokens:null,outputTokens:null,billedKrw:null,error:null,
    fields:p.fields.map(f=>({key:f.key,value:f.value,quote:f.text,source:'IMAGE',bboxNorm:f.bboxNorm,paragraphId:null})),
    retrievedEvidenceIds:p.fields.filter(f=>p.expected.requiredRetrievalKeys.includes(f.key)).map(f=>f.evidenceId)}))};}
describe('offline HTML, OCR and HCX comparison protocol',()=>{
  it('executes real HTML extraction and temporal selector, leaves absent providers NOT_RUN',()=>{
    const r=mediaComparisonReport(pack.manifest,assets);
    expect(r.modes[0]!.status).toBe('SYNTHETIC_HTML_EXECUTED');expect(r.modes[0]!.metrics!.conditionRecall.value).toBeLessThan(1);
    expect(r.modes[1]).toMatchObject({status:'NOT_RUN',metrics:null});expect(r.modes[2]).toMatchObject({status:'NOT_RUN',metrics:null});
    expect(r.temporal).toMatchObject({passed:12,total:12,futureLeaks:0});expect(r.independentHumanReview).toBe('NOT_RUN');
  });
  it('scores a synthetic protocol adapter without promoting it to provider or human acceptance',()=>{
    const r=mediaComparisonReport(pack.manifest,assets,[synthetic()]),mode=r.modes[1]!;
    expect(mode.status).toBe('SYNTHETIC_PROTOCOL');expect(mode.metrics!.conditionRecall.value).toBe(1);
    expect(mode.metrics!.falseEligible).toEqual([]);expect(mode.metrics!.unsupportedEligible).toEqual([]);
    expect(mode.metrics!.citationSupport.value).toBe(1);expect(mode.metrics!.retrievalRecallAt3.value).toBe(1);
    expect(mode.metrics!.bboxIou.mean).toBe(1);expect(mode.measurement!.billedKrw).toBeNull();
    expect(mode.measurement!.latency.minimum50Samples).toBe(false);expect(r.providerAcceptance).toBe('NOT_ESTABLISHED');
  });
  it('counts contradictory eligibility, unsupported citations, bad boxes and missing retrieval',()=>{
    const observation=synthetic(),record=observation.records[1]!;
    record.fields.find(f=>f.key==='CAMPUS')!.value='SEOUL';
    record.fields[0]!.bboxNorm=[0,0,0.01,0.01];record.fields[0]!.quote='invented text';record.retrievedEvidenceIds=[];
    const mode=mediaComparisonReport(pack.manifest,assets,[observation]).modes[1]!;
    expect(mode.metrics!.falseEligible).toContain(record.posterId);expect(mode.metrics!.citationSupport.value).toBeLessThan(1);
    expect(mode.metrics!.bboxIou.mean).toBeLessThan(1);expect(mode.metrics!.retrievalRecallAt3.value).toBeLessThan(1);
  });
  it.each(['image hash','duplicate record','manifest hash'] as const)('rejects unbound %s',kind=>{
    const observation=synthetic();
    if(kind==='image hash')observation.records[0]!.imageSha256='f'.repeat(64);
    if(kind==='duplicate record')observation.records[1]=observation.records[0]!;
    if(kind==='manifest hash')observation.manifestSha256='f'.repeat(64);
    expect(()=>mediaComparisonReport(pack.manifest,assets,[observation])).toThrow();
  });
});