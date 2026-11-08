import {describe,expect,it} from 'vitest';
import {
  aggregateAnd,aggregateOr,parseAsOf,verifySource,evaluateVerifiedCondition,
  verifySemanticProposals,
} from './source-policy.js';
import {checkScholarship} from './scholarships-v2.js';
import {routeCounselingV2} from './counseling-v2.js';
import {prepareRecognitionV2,classifyProofCandidate} from './recognition-v2.js';
import {prepareBadgeV2} from './badges-v2.js';
import {resolveInternationalGuide,reconcileGuideChecklist} from './international-v2.js';
import {FIXED_NOW,OPENED,source,condition,scholarship,fact,FACT_REVISIONS,
  agency,recognitionRule,proof,badge,badgeEvidence,guide} from './v2.fixtures.js';

describe('SourceRevision/time rights gate used by all new features',()=>{
  it('accepts an evidence-bearing cleared current source',()=>{
    expect(verifySource(source(),FIXED_NOW)).toEqual({usable:true,reason:'VERIFIED'});
  });
  it('rejects revoked source even with old valid evidence',()=>{
    expect(verifySource({...source(),status:'REVOKED'},FIXED_NOW).reason).toBe('REVOKED');
  });
  it('rejects blocked or unreviewed rights',()=>{
    for(const rights of ['BLOCKED','UNKNOWN'] as const)
      expect(verifySource({...source(),rights},FIXED_NOW).usable).toBe(false);
  });
  it('rejects unreviewed and missing evidence for claimed verified source',()=>{
    expect(verifySource({...source(),status:'NEEDS_REVIEW'},FIXED_NOW).usable).toBe(false);
    expect(verifySource({...source(),evidenceSpanIds:[]},FIXED_NOW).usable).toBe(false);
  });
  it('rejects future verification and future-effective policy',()=>{
    expect(verifySource({...source(),verifiedAt:'2026-11-09T00:00:00+09:00'},FIXED_NOW)
      .reason).toBe('FUTURE_VERIFICATION');
    expect(verifySource({...source(),effectiveFrom:'2026-11-09T00:00:00+09:00'},FIXED_NOW)
      .reason).toBe('OUT_OF_PERIOD');
  });
  it('expires policy exactly at effectiveUntil',()=>{
    expect(verifySource({...source(),effectiveUntil:FIXED_NOW},FIXED_NOW)
      .reason).toBe('OUT_OF_PERIOD');
  });
  it('does not allow synthetic documents in live mode',()=>{
    const synthetic={...source(),status:'SYNTHETIC' as const};
    expect(verifySource(synthetic,FIXED_NOW).usable).toBe(false);
    expect(verifySource(synthetic,FIXED_NOW,'SYNTHETIC').reason).toBe('SYNTHETIC');
  });
  it('requires timezone-aware reference dates',()=>{
    expect(()=>parseAsOf('2026-11-08T12:00:00')).toThrow('invalid asOf');
    expect(()=>parseAsOf('not-a-date')).toThrow();
  });
  it('propagates tri-state group logic',()=>{
    expect(aggregateAnd(['MET','UNKNOWN'])).toBe('UNKNOWN');
    expect(aggregateAnd(['UNKNOWN','NOT_MET'])).toBe('NOT_MET');
    expect(aggregateOr(['NOT_MET','UNKNOWN'])).toBe('UNKNOWN');
    expect(aggregateOr(['MET','UNKNOWN'])).toBe('MET');
    expect(aggregateOr([])).toBe('UNKNOWN');
  });
});
describe('verified fact evaluation does not promote untrusted fields',()=>{
  it('rejects a stale semester GPA even when the observation timestamp is permitted',()=>{
    const r=evaluateVerifiedCondition(condition(),[fact(3.9,{
      academicTerm:'2024-1',observedAt:'2024-03-01T12:00:00+09:00'})],
      FIXED_NOW,FACT_REVISIONS);
    expect(r).toMatchObject({state:'UNKNOWN',reason:'FACT_OUT_OF_TERM'});
  });
  it('requires the official rule to specify the GPA evidence term',()=>{
    const r=evaluateVerifiedCondition(condition({factTerm:undefined}),[fact(3.9)],
      FIXED_NOW,FACT_REVISIONS);
    expect(r).toMatchObject({state:'UNKNOWN',reason:'FACT_TERM_UNSPECIFIED'});
  });

  it('supports inclusive numeric boundary',()=>{
    expect(evaluateVerifiedCondition(condition(),[fact(3.5)],FIXED_NOW,FACT_REVISIONS).state).toBe('MET');
    expect(evaluateVerifiedCondition(condition(),[fact(3.49)],FIXED_NOW,FACT_REVISIONS).state).toBe('NOT_MET');
  });
  it('does not treat self declaration as official academic transcript',()=>{
    const result=evaluateVerifiedCondition(condition(),[fact(4.0,{provenance:'OWNER_SELF_REPORTED'})],
      FIXED_NOW,FACT_REVISIONS);
    expect(result.state).toBe('UNKNOWN');
  });
  it('requires current explicitly permitted fact revision',()=>{
    expect(evaluateVerifiedCondition(condition(),[fact(3.8,{sourceRevisionId:'revoked-r1'})],
      FIXED_NOW,FACT_REVISIONS).state).toBe('UNKNOWN');
  });
  it('uses newest authorized observation, not an old score',()=>{
    const result=evaluateVerifiedCondition(condition(),[fact(3.0,{
      observedAt:'2026-10-01T00:00:00+09:00'}),fact(3.9)],FIXED_NOW,FACT_REVISIONS);
    expect(result.state).toBe('MET');
  });
  it('abstains on conflicting records at the newest same instant',()=>{
    expect(evaluateVerifiedCondition(condition(),[fact(3.0),fact(4.0)],
      FIXED_NOW,FACT_REVISIONS).reason).toBe('CONFLICTING_FACTS');
  });
  it('ignores future observations and mismatched types',()=>{
    expect(evaluateVerifiedCondition(condition(),[fact(4.0,{
      observedAt:'2026-12-01T00:00:00+09:00'})],FIXED_NOW,FACT_REVISIONS).state)
      .toBe('UNKNOWN');
    expect(evaluateVerifiedCondition(condition(),[fact('3.8')],
      FIXED_NOW,FACT_REVISIONS).reason).toBe('TYPE_OR_OPERATOR_MISMATCH');
  });
  it('handles verified boolean, string in, and document operations',()=>{
    const yes=fact(true,{key:'enrolled'});
    const result=evaluateVerifiedCondition(condition({
      factKey:'enrolled',op:'BOOL_EQ',expected:true,
    }),[yes],FIXED_NOW,FACT_REVISIONS);
    expect(result.state).toBe('MET');
    expect(evaluateVerifiedCondition(condition({
      factKey:'campus',op:'TEXT_IN',expected:['SEOUL','GLOBAL'],
    }),[fact('SEOUL',{key:'campus'})],FIXED_NOW,FACT_REVISIONS).state).toBe('MET');
    expect(evaluateVerifiedCondition(condition({
      factKey:'document',op:'DOCUMENT_PRESENT',expected:true,
    }),[fact(false,{key:'document'})],FIXED_NOW,FACT_REVISIONS).state).toBe('NOT_MET');
  });
});
describe('model evidence candidate validation shared by mentor and skill comparison',()=>{
  const allowed=new Map([['candidate-1',['evidence-1','topic-1'] as readonly string[]]]);
  const valid={candidateId:'candidate-1',score:0.9,evidenceCodes:['topic-1'],
    modelVersion:'model-r1',inputDigest:'digest-1'};
  it('only admits cited known candidate evidence',()=>{
    expect(verifySemanticProposals(allowed,[valid],'digest-1').size).toBe(1);
  });
  it('rejects hallucinated candidate, proof and wrong input digest',()=>{
    expect(verifySemanticProposals(allowed,[{...valid,candidateId:'fake'}],'digest-1').size).toBe(0);
    expect(verifySemanticProposals(allowed,[{...valid,evidenceCodes:['fake']}],'digest-1').size).toBe(0);
    expect(verifySemanticProposals(allowed,[valid],'old-digest').size).toBe(0);
  });
  it('rejects duplicated candidates and impossible scores',()=>{
    expect(verifySemanticProposals(allowed,[{...valid,score:1.5}],'digest-1').size).toBe(0);
    expect(verifySemanticProposals(allowed,[{...valid,evidenceCodes:[]}],'digest-1').size).toBe(0);
    expect(verifySemanticProposals(allowed,[valid,valid],'digest-1').size).toBe(1);
  });
});
describe('#343 — actionable scholarship evaluation',()=>{
  const run=(policy=scholarship(),facts=[fact()])=>checkScholarship({
    policy,verifiedFacts:facts,authorizedFactRevisions:FACT_REVISIONS,asOf:FIXED_NOW,
  });
  it('evaluates a valid rule and reports the official application window',()=>{
    expect(run()).toMatchObject({overall:'MET',applicationWindow:'OPEN',
      officialDecision:null,mode:'VERIFIED_FACT_CHECK'});
  });
  it('does not confuse preliminary eligibility with formal award',()=>{
    expect(run().officialDecision).toBeNull();
  });
  it('denies a verified GPA mismatch without inventing future prerequisites',()=>{
    expect(run(scholarship(),[fact(3.0)]).overall).toBe('NOT_MET');
  });
  it('identifies missing facts for the student',()=>{
    expect(run(scholarship(),[]).missingFactKeys).toEqual(['gpa']);
  });
  it('allows ANY alternates only with verified evidence',()=>{
    const alternative=scholarship({groups:[{id:'alt',join:'ANY',conditions:[
      condition(),condition({id:'major',factKey:'major',op:'TEXT_EQ',expected:'ECON',
        sourceSpanId:'span-2'})]}]});
    expect(run(alternative,[fact(3.1),fact('ECON',{key:'major'})]).overall).toBe('MET');
    expect(run(alternative,[fact(3.1)]).overall).toBe('UNKNOWN');
  });
  it('evaluates multiple required groups with AND behavior',()=>{
    const required=scholarship({groups:[
      {id:'grade',join:'ALL',conditions:[condition()]},
      {id:'student',join:'ALL',conditions:[condition({id:'enrolled',
        factKey:'enrolled',op:'BOOL_EQ',expected:true,sourceSpanId:'span-2'})]},
    ]});
    expect(run(required,[fact(3.9),fact(false,{key:'enrolled'})]).overall).toBe('NOT_MET');
    expect(run(required,[fact(3.9)]).overall).toBe('UNKNOWN');
  });
  it('ignores optional conditions when deciding required eligibility',()=>{
    const optional=scholarship({groups:[{id:'required',join:'ALL',
      conditions:[condition(),condition({id:'optional',factKey:'extra',
        sourceSpanId:'span-2',required:false})]}]});
    expect(run(optional).overall).toBe('MET');
  });
  it('does not trust a policy condition with no official citation span',()=>{
    expect(run(scholarship({groups:[{id:'g',join:'ALL',
      conditions:[condition({sourceSpanId:'unapproved-span'})]}]})).overall).toBe('UNKNOWN');
  });
  it('invalidates all checks when source is revoked',()=>{
    expect(run(scholarship({source:{...source(),status:'REVOKED'}}))).toMatchObject({
      mode:'NOT_AVAILABLE',overall:'UNKNOWN',sourceReason:'REVOKED'});
  });
  it('separates application not yet open and closed',()=>{
    const early=checkScholarship({policy:scholarship(),verifiedFacts:[fact()],
      authorizedFactRevisions:FACT_REVISIONS,asOf:'2026-09-01T12:00:00+09:00'});
    const closed=checkScholarship({policy:scholarship(),verifiedFacts:[fact()],
      authorizedFactRevisions:FACT_REVISIONS,asOf:'2027-01-01T12:00:00+09:00'});
    expect(early.applicationWindow).toBe('BEFORE_OPEN');
    expect(closed.applicationWindow).toBe('CLOSED');
  });
});
describe('#345 — counseling institutional routing',()=>{
  it('prioritizes precise purposes with verified campus/language match',()=>{
    const services=[
      agency('related',{purposeCodes:[],relatedPurposeCodes:['CAREER']}),
      agency('exact'),
    ];
    expect(routeCounselingV2({purposes:['CAREER'],campus:'SEOUL',language:'ko',
      audienceCodes:['STUDENT'],services,asOf:FIXED_NOW}).matches.map(x=>x.serviceId))
      .toEqual(['exact','related']);
  });
  it('does not infer audience if user did not disclose target group',()=>{
    const r=routeCounselingV2({purposes:['CAREER'],services:[agency('a')],asOf:FIXED_NOW});
    expect(r.matches[0]?.audienceState).toBe('UNKNOWN');
  });
  it('omits inactive or revoked services and reports no candidates',()=>{
    const r=routeCounselingV2({purposes:['CAREER'],services:[
      agency('a',{active:false}),agency('b',{source:{...source(),status:'REVOKED'}})],
    asOf:FIXED_NOW});
    expect(r.status).toBe('NO_MATCH');
  });
  it('gives explicit no-purpose state',()=>{
    expect(routeCounselingV2({purposes:[],services:[agency('a')],asOf:FIXED_NOW}).status)
      .toBe('NO_PURPOSE');
  });
  it('never returns an insecure external application link',()=>{
    const r=routeCounselingV2({purposes:['CAREER'],services:[
      agency('bad',{officialUrl:'http://untrusted.example/counsel'}),
    ],asOf:FIXED_NOW});
    expect(r.matches[0]?.officialApplicationUrl).toBeNull();
  });
  it('limits recommendations to three and quarantines every copy of a duplicate',()=>{
    // #364: the repeated 'a' is excluded entirely instead of keeping the first copy.
    const services=[agency('a'),agency('b'),agency('c'),agency('d'),agency('a')];
    const r=routeCounselingV2({purposes:['CAREER'],services,asOf:FIXED_NOW});
    expect(r.matches.map(x=>x.serviceId)).toEqual(['b','c','d']);
    expect(r.excluded).toBe(2);
  });
});
describe('#346 — consented private activity evidence preparation',()=>{
  const activity={id:'A1',kind:'VOLUNTEER',endedAt:'2026-10-30T00:00:00+09:00'};
  const run=(r=recognitionRule(),proofs=[proof('CERTIFICATE'),proof('REPORT')])=>
    prepareRecognitionV2({rule:r,activity,proofs,asOf:FIXED_NOW});
  it('marks full documentation ready for official review but never accepted',()=>{
    expect(run()).toMatchObject({status:'READY_FOR_OFFICIAL_REVIEW',
      officiallyRecognized:false,missingKinds:[]});
  });
  it('surfaces missing documents and rejects other activities as evidence',()=>{
    const r=run(recognitionRule(),[proof('CERTIFICATE'),proof('REPORT',{activityId:'OTHER'})]);
    expect(r.status).toBe('DOCUMENTS_PENDING');
    expect(r.missingKinds).toEqual(['REPORT']);
  });
  it('requires student review and valid nonexpired proof',()=>{
    const r=run(recognitionRule(),[proof('CERTIFICATE',{ownerReviewed:false}),
      proof('REPORT',{expiryAt:'2026-01-01T00:00:00+09:00'})]);
    expect(r.missingKinds).toEqual(['CERTIFICATE','REPORT']);
  });
  it('supports alternatives in an official document group',()=>{
    const rule=recognitionRule({documentGroups:[{id:'choice',join:'ANY',
      kinds:['CERTIFICATE','REPORT']}]});
    expect(run(rule,[proof('REPORT')]).status).toBe('READY_FOR_OFFICIAL_REVIEW');
  });
  it('does not claim eligibility for wrong activity type',()=>{
    expect(run(recognitionRule({eligibleKinds:['INTERNSHIP']})).status).toBe('NOT_APPLICABLE');
  });
  it('marks policy change as unknown and closed intake as closed',()=>{
    expect(run(recognitionRule({source:{...source(),status:'REVOKED'}})).status).toBe('UNKNOWN_RULE');
    expect(run(recognitionRule({applicationEndsAt:'2026-11-01T23:59:00+09:00'})).status).toBe('CLOSED');
  });
  it('does not allow OCR to automatically approve without an owner',()=>{
    const r=classifyProofCandidate({rule:recognitionRule(),assetId:'asset-1',
      proposedKind:'REPORT',evidencePage:0,confidence:0.92,ownerConfirmed:false});
    expect(r.status).toBe('NEEDS_REVIEW');
  });
  it('denies fabricated OCR proof kinds and invalid evidence coordinates',()=>{
    expect(classifyProofCandidate({rule:recognitionRule(),assetId:'asset-1',
      proposedKind:'PASSPORT',evidencePage:0,confidence:0.91,ownerConfirmed:true}).status).toBe('REJECTED');
    expect(classifyProofCandidate({rule:recognitionRule(),assetId:'asset-1',
      proposedKind:'REPORT',evidencePage:-1,confidence:0.91,ownerConfirmed:true}).status).toBe('REJECTED');
  });
});
describe('#349 — badge prerequisites are not badge issuance',()=>{
  it('abstains when two ALL requirements reuse the same activity without issuer permission',()=>{
    const shared=badge({groups:[{id:'multiple',join:'ALL',requirements:[
      {id:'data',topicCode:'DATA_ANALYTICS',minimumDistinctActivities:2},
      {id:'design',topicCode:'PRODUCT_UX',minimumDistinctActivities:2}]}]});
    const evidence=[badgeEvidence('A',{topicCodes:['DATA_ANALYTICS','PRODUCT_UX']}),
      badgeEvidence('B',{topicCodes:['DATA_ANALYTICS','PRODUCT_UX']})];
    const r=prepareBadgeV2({badge:shared,evidence,asOf:FIXED_NOW});
    expect(r.status).toBe('UNKNOWN');
    expect(r.groups[0]?.reason).toBe('ACTIVITY_REUSE_UNVERIFIED');
    const withPermission=prepareBadgeV2({badge:badge({groups:[{
      ...shared.groups[0]!,allowActivityReuse:true}]}),evidence,asOf:FIXED_NOW});
    expect(withPermission.status).toBe('READY_TO_REQUEST_REVIEW');
  });

  it('requires two distinct owner-reviewed activities',()=>{
    const r=prepareBadgeV2({badge:badge(),evidence:[badgeEvidence('A'),badgeEvidence('A')],
      asOf:FIXED_NOW});
    expect(r.status).toBe('IN_PROGRESS');
    expect(r.groups[0]?.requirements[0]?.observedDistinct).toBe(1);
  });
  it('tracks readiness without issuing credentials',()=>{
    const r=prepareBadgeV2({badge:badge(),evidence:[badgeEvidence('A'),badgeEvidence('B')],
      asOf:FIXED_NOW});
    expect(r.status).toBe('READY_TO_REQUEST_REVIEW');
    expect(r.issuedCredential).toBeNull();
  });
  it('does not count unapproved experience or evidence from the future',()=>{
    const r=prepareBadgeV2({badge:badge(),evidence:[
      badgeEvidence('A',{ownerApproved:false}),
      badgeEvidence('B',{date:'2026-12-01T00:00:00+09:00'})],asOf:FIXED_NOW});
    expect(r.status).toBe('IN_PROGRESS');
  });
  it('abstains under revoked issuer rules',()=>{
    expect(prepareBadgeV2({badge:badge({source:{...source(),status:'REVOKED'}}),
      evidence:[],asOf:FIXED_NOW}).status).toBe('UNKNOWN');
  });
  it('supports ANY badge prereqs and reports only required missing topics',()=>{
    const rule=badge({groups:[{id:'choice',join:'ANY',requirements:[
      {id:'a',topicCode:'DATA_ANALYTICS',minimumDistinctActivities:1},
      {id:'b',topicCode:'PRODUCT_UX',minimumDistinctActivities:1}]}]});
    const r=prepareBadgeV2({badge:rule,evidence:[badgeEvidence('A')],asOf:FIXED_NOW});
    expect(r.status).toBe('READY_TO_REQUEST_REVIEW');
    expect(r.requiredNextTopics).toEqual([]);
  });
});
describe('#352 — reviewed translations and owner-only administrative checklist',()=>{
  const request={topicCode:'ENROLLMENT',campus:'SEOUL',term:'2026-2',
    audienceCodes:['INTERNATIONAL_STUDENT'],asOf:FIXED_NOW};
  it('accepts a human-reviewed translation bound to the current policy revision',()=>{
    expect(resolveInternationalGuide({guide:guide(),locale:'zh',...request}).status).toBe('READY');
  });
  it('falls back to original Korean when English is machine draft',()=>{
    expect(resolveInternationalGuide({guide:guide(),locale:'en',...request}))
      .toMatchObject({status:'KOREAN_FALLBACK',locale:'ko'});
  });
  it('rejects old approved translations against a new source revision',()=>{
    const r=resolveInternationalGuide({guide:guide({
      source:source('newer-revision')}),locale:'zh',...request});
    expect(r.status).toBe('TRANSLATION_UNAVAILABLE');
  });
  it('refuses incorrect campus and semester',()=>{
    expect(resolveInternationalGuide({guide:guide(),locale:'ko',
      ...request,campus:'GLOBAL'}).status).toBe('NOT_APPLICABLE');
    expect(resolveInternationalGuide({guide:guide(),locale:'ko',
      ...request,term:'2027-1'}).status).toBe('NOT_APPLICABLE');
  });
  it('does not assume unprovided campus or audience',()=>{
    expect(resolveInternationalGuide({guide:guide(),locale:'ko',
      topicCode:'ENROLLMENT',term:'2026-2',asOf:FIXED_NOW}).status)
      .toBe('APPLICABILITY_UNKNOWN');
  });
  it('rejects guide steps not cited by the current official source',()=>{
    const r=resolveInternationalGuide({guide:guide({steps:[
      {id:'invented',order:1,documentCodes:[],sourceSpanId:'not-in-source'}]}),
      locale:'ko',...request});
    expect(r.status).toBe('UNKNOWN_SOURCE');
  });
  it('reconciles checked steps only for the exact guide version',()=>{
    const saved={guideId:'international-guide-1',guideRevisionId:'source-r1',
      ownerCheckedStepIds:['step-1','ghost','step-1'],expectedVersion:3};
    expect(reconcileGuideChecklist(guide(),saved,3)).toMatchObject({
      state:'READY',checkedStepIds:['step-1'],invalidatedStepIds:['ghost'],
      officialAdministrationComplete:false});
    expect(reconcileGuideChecklist(guide(),saved,4).state).toBe('VERSION_CONFLICT');
    expect(reconcileGuideChecklist(guide({source:source('new-rev')}),saved,3).state)
      .toBe('STALE_GUIDE');
  });
});
describe('#345 counseling destination applicability regressions',()=>{
  it('excludes a service with a known nonmatching audience',()=>{
    const r=routeCounselingV2({purposes:['CAREER'],audienceCodes:['STUDENT'],
      services:[agency('staff-only',{audienceCodes:['EMPLOYEE']})],asOf:FIXED_NOW});
    expect(r.matches).toEqual([]);
    expect(r.excluded).toBe(1);
  });
  it('preserves explicitly unknown language and campus eligibility',()=>{
    const r=routeCounselingV2({purposes:['CAREER'],campus:'SEOUL',language:'ko',
      services:[agency('unverified-scope',{campuses:[],languages:[]})],asOf:FIXED_NOW});
    expect(r.matches[0]).toMatchObject({campusState:'UNKNOWN',
      languageState:'UNKNOWN'});
  });
});
