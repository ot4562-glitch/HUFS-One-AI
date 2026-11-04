import {describe,it,expect} from 'vitest';
import {AcademicRulePackVNextSchema} from '@hufs-one/contracts';
import {compareRulePackRevisions} from './rule-diff.js';
import {syntheticAcademicPack,syntheticMultiDocumentPack,SYNTHETIC_AS_OF} from '../../../../tests/fixtures/academic-133.js';
describe('#133 revision comparisons preserve new rule meanings',()=>{
  it('recomputes area-spread and completed-group changes instead of comparing generic course counts',()=>{
    const base=syntheticAcademicPack(),common=base.requirements[0]!;
    for(const [first,last,field] of [
      [{kind:'AREA_SPREAD',areaIds:['A','B'],minAreas:1,requiredCreditUnits:6},
        {kind:'AREA_SPREAD',areaIds:['A','B'],minAreas:2,requiredCreditUnits:6},'minAreas'],
      [{kind:'GROUP_CHOICE',groups:[['G1'],['G2']],k:1},
        {kind:'GROUP_CHOICE',groups:[['G1','G2'],['G3']],k:1},'groups'],
    ] as const){
      const {kind:_,requiredCreditUnits:__,...refs}=common as typeof common&{requiredCreditUnits:number};
      const previous=AcademicRulePackVNextSchema.parse({...base,requirements:[{...refs,...first}]});
      const next=AcademicRulePackVNextSchema.parse({...base,version:'SYN-PACK-2',supersedesVersion:base.version,
        requirements:[{...refs,...last}]});
      const result=compareRulePackRevisions({asOf:SYNTHETIC_AS_OF,previous,next,attempts:[{
        attemptToken:'G1',canonicalCourseId:'G1',creditUnits:6,areaIds:['A'],ledger:'EARNED',recognition:'RECOGNIZED',term:'2025-2'}]});
      expect(result).toMatchObject({state:'READY',requirements:[{definition:'CHANGED',stateChange:'LOST'}]});
      expect(result.requirements[0]?.changedFields).toContain(field);
    }
  });
  it('does not compare a revision belonging to a different degree path or track',()=>{
    const base=syntheticAcademicPack();
    const previous={...base,scope:{...base.scope,degreePath:'DOUBLE_MAJOR',track:'TRACK-A'}};
    for(const change of [{degreePath:'ADVANCED_SINGLE'},{track:'TRACK-B'}]){
      const next={...previous,version:'SYN-PACK-2',supersedesVersion:base.version,scope:{...previous.scope,...change}};
      const result=compareRulePackRevisions({asOf:SYNTHETIC_AS_OF,previous,next,attempts:[]});
      expect(result.requirements).toEqual([]);
      expect(result.blockers).toContainEqual({code:'SCOPE_MISMATCH'});
    }
  });
  it('reports a changed supporting original even if its clause ID and span ID were reused',()=>{
    const previous=AcademicRulePackVNextSchema.parse(syntheticMultiDocumentPack());
    const next=AcademicRulePackVNextSchema.parse({...previous,version:'SYN-PACK-2',supersedesVersion:previous.version,
      sourceDocuments:previous.sourceDocuments!.map(d=>d.documentId==='SYN-DOC-B'?{...d,sha256:'c'.repeat(64)}:d),
      validationReport:{...previous.validationReport!,sourceDocumentHashes:previous.validationReport!.sourceDocumentHashes!.map(
        h=>h.documentId==='SYN-DOC-B'?{...h,sha256:'c'.repeat(64)}:h)}});
    const result=compareRulePackRevisions({asOf:SYNTHETIC_AS_OF,previous,next,attempts:[]});
    expect(result.requirements[0]).toMatchObject({definition:'CHANGED',changedFields:['clauses']});
  });
});
