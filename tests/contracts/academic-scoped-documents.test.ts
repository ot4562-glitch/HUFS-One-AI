import {describe,it,expect} from 'vitest';
import {AcademicRulePackVNextSchema,AcademicRequirementVNextSchema,selectAcademicRulePackAsOfVNext,
  verifyAcademicSourceCoverageVNext,parseApprovedAcademicRulePackVNext} from '@hufs-one/contracts';
import {decideRulePackActivation} from '../../packages/core/src/academics/rule-approval.js';
import {syntheticAcademicPack,syntheticMultiDocumentPack,syntheticTrustedDocuments,
  syntheticAcademicSelection as request,SYNTHETIC_AS_OF} from '../fixtures/academic-133.js';

describe('#133 scoped selection and independently bound documents',()=>{
  it('selects the exact degree path without applying the 84-unit pack to a 140-unit path',()=>{
    const base=syntheticAcademicPack();
    const double=AcademicRulePackVNextSchema.parse({...base,version:'SYN-DOUBLE',scope:{...base.scope,degreePath:'DOUBLE_MAJOR'}});
    const advanced=AcademicRulePackVNextSchema.parse({...base,version:'SYN-ADVANCED',
      scope:{...base.scope,degreePath:'ADVANCED_SINGLE'},
      requirements:base.requirements.map(r=>({...r,requiredCreditUnits:140}))});
    expect(selectAcademicRulePackAsOfVNext([double,advanced],{...request,degreePath:'ADVANCED_SINGLE'})?.version).toBe('SYN-ADVANCED');
    expect(selectAcademicRulePackAsOfVNext([double,advanced],{...request,degreePath:'DOUBLE_MAJOR'})?.version).toBe('SYN-DOUBLE');
  });
  it('holds omitted/unselected degree and undecided track, including a single scoped pack',()=>{
    const base=syntheticAcademicPack();
    const pack=AcademicRulePackVNextSchema.parse({...base,scope:{...base.scope,degreePath:'DOUBLE_MAJOR',track:'SYN-TRACK'}});
    for(const choice of [{},{degreePath:'UNSELECTED',track:'SYN-TRACK'},
      {degreePath:'DOUBLE_MAJOR',track:'UNDECIDED'},{degreePath:'DOUBLE_MAJOR'}]){
      expect(selectAcademicRulePackAsOfVNext([pack],{...request,...choice})).toBeNull();
    }
    expect(selectAcademicRulePackAsOfVNext([pack],{...request,degreePath:'DOUBLE_MAJOR',track:'SYN-TRACK'})).toEqual(pack);
    expect(selectAcademicRulePackAsOfVNext([pack],{...request,degreePath:'DOUBLE_MAJOR',track:'OTHER'})).toBeNull();
  });
  it('does not require a track belonging only to a different concrete degree path',()=>{
    const base=syntheticAcademicPack();
    const advanced=AcademicRulePackVNextSchema.parse({...base,version:'SYN-ADVANCED',
      scope:{...base.scope,degreePath:'ADVANCED_SINGLE'}});
    const other=AcademicRulePackVNextSchema.parse({...base,version:'SYN-DOUBLE-TRACK',
      scope:{...base.scope,degreePath:'DOUBLE_MAJOR',track:'SYN-TRACK'}});
    expect(selectAcademicRulePackAsOfVNext([advanced,other],{...request,degreePath:'ADVANCED_SINGLE'})).toEqual(advanced);
    expect(selectAcademicRulePackAsOfVNext([advanced,other],{...request,degreePath:'DOUBLE_MAJOR'})).toBeNull();
  });
  it('preserves legacy-only selection but refuses mixed matching legacy/scoped supersede chains',()=>{
    const old=syntheticAcademicPack();
    expect(selectAcademicRulePackAsOfVNext([old],request)).toEqual(old);
    const scoped=AcademicRulePackVNextSchema.parse({...old,version:'SYN-PACK-2',supersedesVersion:old.version,
      scope:{...old.scope,degreePath:'DOUBLE_MAJOR'}});
    expect(selectAcademicRulePackAsOfVNext([old,scoped],{...request,degreePath:'DOUBLE_MAJOR'})).toBeNull();
  });
  it('accepts exact independent coverage of both documents, irrespective of trusted order',()=>{
    const pack=AcademicRulePackVNextSchema.parse(syntheticMultiDocumentPack()),trusted=syntheticTrustedDocuments();
    trusted.sourceDocuments.reverse();trusted.clauses.reverse();
    expect(verifyAcademicSourceCoverageVNext(pack,trusted)).toBe(true);
    expect(parseApprovedAcademicRulePackVNext(pack,trusted)?.version).toBe(pack.version);
    expect(decideRulePackActivation({asOf:SYNTHETIC_AS_OF,active:null,candidate:pack,trustedOriginal:trusted}).decision).toBe('ACTIVATED');
  });
  it('holds an absent or changed second original even when numeric and first-document checks pass',()=>{
    const pack=AcademicRulePackVNextSchema.parse(syntheticMultiDocumentPack());
    const missing=syntheticTrustedDocuments();missing.sourceDocuments.pop();
    const altered=syntheticTrustedDocuments();altered.sourceDocuments[1]!.sourceDocumentSha256='c'.repeat(64);
    const wrongClause=syntheticTrustedDocuments();wrongClause.clauses[1]!.sourceDocumentId='SYN-DOC-A';
    for(const trusted of [missing,altered,wrongClause]){
      expect(verifyAcademicSourceCoverageVNext(pack,trusted)).toBe(false);
      expect(parseApprovedAcademicRulePackVNext(pack,trusted)).toBeNull();
      expect(decideRulePackActivation({asOf:SYNTHETIC_AS_OF,active:null,candidate:pack,
        trustedOriginal:trusted,numericCheck:{matched:1,total:1}}).decision).toBe('HELD');
    }
  });
  it('requires complete per-document hashes and clause-document IDs before approval',()=>{
    const raw=syntheticMultiDocumentPack();
    for(const changed of [
      {...raw,validationReport:{...raw.validationReport,sourceDocumentHashes:raw.validationReport.sourceDocumentHashes.slice(0,1)}},
      {...raw,validationReport:{...raw.validationReport,sourceDocumentHashes:[raw.validationReport.sourceDocumentHashes[0],raw.validationReport.sourceDocumentHashes[0]]}},
      {...raw,clauseInventory:raw.clauseInventory.map(({sourceDocumentId,...c})=>c)},
      {...raw,clauseInventory:raw.clauseInventory.map(c=>({...c,sourceDocumentId:'UNKNOWN'}))},
      {...raw,sourceDocuments:[...raw.sourceDocuments,raw.sourceDocuments[0]]},
      {...raw,sourceDocuments:raw.sourceDocuments.map(d=>({...d,publishedAt:'2027-01-01T00:00:00.000Z'}))},
      {...raw,sourceDocumentSha256:'c'.repeat(64),validationReport:{...raw.validationReport,sourceDocumentSha256:'c'.repeat(64)}},
    ])expect(AcademicRulePackVNextSchema.safeParse(changed).success).toBe(false);
  });
  it('holds a legacy candidate when the independently supplied original inventory is multi-document',()=>{
    const pack=syntheticAcademicPack();
    const trusted={sourceDocumentSha256:pack.sourceDocumentSha256,
      sourceDocuments:[{documentId:'SYN-DOC-A',sourceDocumentSha256:pack.sourceDocumentSha256}],
      clauses:pack.clauseInventory.map(({clauseId,kind,sourceSpanRef})=>({clauseId,kind,sourceSpanRef}))};
    expect(verifyAcademicSourceCoverageVNext(pack,trusted)).toBe(false);
    expect(decideRulePackActivation({asOf:SYNTHETIC_AS_OF,active:null,candidate:pack,
      trustedOriginal:trusted,numericCheck:{matched:1,total:1}}).decision).toBe('HELD');
  });
  it('preserves the legacy single-document coverage contract',()=>{
    const pack=syntheticAcademicPack(),original={sourceDocumentSha256:pack.sourceDocumentSha256,
      clauses:pack.clauseInventory.map(({clauseId,kind,sourceSpanRef})=>({clauseId,kind,sourceSpanRef}))};
    expect(verifyAcademicSourceCoverageVNext(pack,original)).toBe(true);
    expect(verifyAcademicSourceCoverageVNext(pack,{...original,sourceDocumentSha256:'b'.repeat(64)})).toBe(false);
  });
  it('validates bounded distinct AREA_SPREAD and disjoint GROUP_CHOICE definitions',()=>{
    const base=syntheticAcademicPack().requirements[0]!;
    const common={id:base.id,semanticKey:base.semanticKey,sourceClauseIds:base.sourceClauseIds,
      exceptionClauseIds:[],evidenceRefs:base.evidenceRefs};
    const area={...common,kind:'AREA_SPREAD',areaIds:['SYN-A','SYN-B'],minAreas:2,requiredCreditUnits:12};
    const group={...common,kind:'GROUP_CHOICE',groups:[['SYN-G1','SYN-G2'],['SYN-H1','SYN-H2']],k:1};
    expect(AcademicRequirementVNextSchema.safeParse(area).success).toBe(true);
    expect(AcademicRequirementVNextSchema.safeParse(group).success).toBe(true);
    for(const r of [{...area,areaIds:['SYN-A','SYN-A']},{...area,minAreas:3},{...area,requiredCreditUnits:0},
      {...group,groups:[['SYN-G1'],['SYN-G1']]},{...group,k:3},{...group,groups:[[],['SYN-H1']]}]){
      expect(AcademicRequirementVNextSchema.safeParse(r).success).toBe(false);
    }
  });
  it('does not approve a language rule with unknown official applicability',()=>{
    const pack=syntheticAcademicPack();
    const candidate={...pack,validationReport:{...pack.validationReport!,blockingIssues:[{code:'UNKNOWN_APPLICABILITY'}]}};
    expect(AcademicRulePackVNextSchema.safeParse(candidate).success).toBe(false);
  });
});
