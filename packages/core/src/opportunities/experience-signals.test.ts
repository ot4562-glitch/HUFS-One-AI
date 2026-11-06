import {describe, expect, it} from 'vitest';
import type {TopicCode} from '@hufs-one/contracts';
import {DEMO_AS_OF, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT} from './demo-corpus.js';
import type {RecommendationProfile} from './evaluate.js';
import {composeFeed} from './feed.js';
import {
  SKILL_TOPIC_POLICY_V1, approvedExperienceSignal, assessSkillCandidates, complementSuggestions, withApprovedExperience,
  type ExperienceEvidence, type TagApproval,
} from './experience-signals.js';

// SYNTHETIC experiences written for this test (#259); not any real student's text.
const theater:ExperienceEvidence = {experienceId:'SYN-EXP-THEATER', contentVersion:2, consentVersion:1, consent:'ACTIVE', paragraphs:[
  {paragraphId:'p1', text:'가상 연극 동아리에서 무대 감독을 맡아 배우 12명의 리허설 일정을 조정했다.'},
  {paragraphId:'p2', text:'공연 홍보를 위해 SNS 계정을 운영했다.'},
]};
const workshop:ExperienceEvidence = {experienceId:'SYN-EXP-PYTHON', contentVersion:1, consentVersion:1, consent:'ACTIVE', paragraphs:[
  {paragraphId:'p1', text:'Python 시각화 워크숍에서 matplotlib으로 공공 데이터 대시보드를 만들었다.'},
  {paragraphId:'p2', text:'심화 머신러닝 세션은 일정이 겹쳐 듣지 못했다.'},
]};
const cafe:ExperienceEvidence = {experienceId:'SYN-EXP-CAFE', contentVersion:3, consentVersion:2, consent:'ACTIVE', paragraphs:[
  {paragraphId:'p1', text:'가상 카페 운영 아르바이트로 주문을 받고 재고를 관리했다.'},
  {paragraphId:'p2', text:'처음에는 불안했다. 신메뉴 홍보 포스터는 만들지 못했다.'},
]};
const active = (e:ExperienceEvidence, topics:readonly TopicCode[]):TagApproval =>
  ({state:'ACTIVE', version:1, contentVersion:e.contentVersion, consentVersion:e.consentVersion, topics});
const checks = (e:ExperienceEvidence, c:Parameters<typeof assessSkillCandidates>[1]) => assessSkillCandidates(e, c).map(a => [a.topicCode, a.check, a.skills.join('+')]);

describe('#259 evidence vs AI candidate: every candidate is checked against the current text', () => {
  it('grounds a quoted visualization skill; Python alone is a SOFTWARE_DEV skill, not DATA_ANALYTICS proof', () => {
    expect(checks(workshop, [
      {paragraphId:'p1', quote:'matplotlib으로 공공 데이터 대시보드를 만들었다', topicCode:'DATA_ANALYTICS'},
      {paragraphId:'p1', quote:'Python 시각화 워크숍', topicCode:'SOFTWARE_DEV'},
    ])).toEqual([
      ['DATA_ANALYTICS', 'GROUNDED', 'DATA_VISUALIZATION'],
      ['SOFTWARE_DEV', 'GROUNDED', 'DATA_VISUALIZATION+PYTHON_PROGRAMMING'],
    ]);
  });

  it('a skipped session is NEGATED or OFF_POLICY, never grounded (counter-example)', () => {
    expect(checks(workshop, [{paragraphId:'p2', quote:'심화 머신러닝 세션은 일정이 겹쳐 듣지 못했다', topicCode:'AI_ML'}]))
      .toEqual([['AI_ML', 'OFF_POLICY', '']]);
    expect(checks(cafe, [{paragraphId:'p2', quote:'신메뉴 홍보 포스터는 만들지 못했다', topicCode:'MARKETING_BRAND'}]))
      .toEqual([['MARKETING_BRAND', 'NEGATED', 'PROMOTION']]);
  });

  it('"불안했다" is not a negation, and a real coordination skill maps to no topic', () => {
    expect(checks(cafe, [{paragraphId:'p2', quote:'처음에는 불안했다.', topicCode:'HR_ORG'}])).toEqual([['HR_ORG', 'OFF_POLICY', '']]);
    expect(checks(theater, [{paragraphId:'p1', quote:'리허설 일정을 조정했다', topicCode:'HR_ORG'}]))
      .toEqual([['HR_ORG', 'NO_TOPIC_MAPPING', 'SCHEDULING_COORDINATION']]);
    expect(checks(cafe, [{paragraphId:'p1', quote:'주문을 받고 재고를 관리했다', topicCode:'STARTUP_ENTREPRENEUR'}]))
      .toEqual([['STARTUP_ENTREPRENEUR', 'NO_TOPIC_MAPPING', 'CUSTOMER_SERVICE+STORE_OPERATIONS']]);
  });

  it('rejects fabricated quotes, unknown paragraphs, topic-less citations and any check without consent', () => {
    expect(checks(theater, [
      {paragraphId:'p1', quote:'뮤지컬 예산 3천만 원을 관리했다', topicCode:'FINANCE_INVESTMENT'},
      {paragraphId:'p9', quote:'공연 홍보', topicCode:'MARKETING_BRAND'},
      {paragraphId:'p2', quote:'공연 홍보를 위해 SNS 계정을 운영했다'},
      {paragraphId:'p2', quote:'   ', topicCode:'MARKETING_BRAND'},
    ])).toEqual([
      ['FINANCE_INVESTMENT', 'UNGROUNDED_QUOTE', ''], ['', 'NO_TOPIC', 'PROMOTION'],
      ['MARKETING_BRAND', 'UNGROUNDED_QUOTE', ''], ['MARKETING_BRAND', 'UNKNOWN_PARAGRAPH', ''],
    ].map(([t, c, s]) => [t === '' ? null : t, c, s]));
    const revoked = {...theater, consent:'REVOKED' as const};
    expect(checks(revoked, [{paragraphId:'p2', quote:'공연 홍보', topicCode:'MARKETING_BRAND'}])).toEqual([['MARKETING_BRAND', 'BLOCKED_CONSENT', '']]);
  });

  it('every assessment stays NEEDS_REVIEW and is independent of citation order', () => {
    const cs = [{paragraphId:'p2', quote:'공연 홍보', topicCode:'MARKETING_BRAND' as const}, {paragraphId:'p1', quote:'일정을 조정', topicCode:'HR_ORG' as const}];
    const a = assessSkillCandidates(theater, cs), b = assessSkillCandidates(theater, [...cs].reverse());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.every(x => x.reviewState === 'NEEDS_REVIEW')).toBe(true);
  });

  it('the policy table is explicit: every keyword is normalized and topic-less skills are declared', () => {
    for (const rule of SKILL_TOPIC_POLICY_V1) for (const k of rule.keywords) expect(k).toBe(k.toLowerCase().replace(/\s+/gu, ''));
    expect(SKILL_TOPIC_POLICY_V1.filter(r => r.topic === null).map(r => r.skill).sort())
      .toEqual(['CUSTOMER_SERVICE', 'SCHEDULING_COORDINATION', 'STORE_OPERATIONS']);
  });
});

describe('#259 only a current owner approval becomes a recommendation signal', () => {
  it('ACTIVE on the same content and consent version → topics; anything else → no signal with the reason', () => {
    expect(approvedExperienceSignal(workshop, active(workshop, ['SOFTWARE_DEV', 'DATA_ANALYTICS', 'DATA_ANALYTICS'])))
      .toEqual({experienceId:'SYN-EXP-PYTHON', topics:['DATA_ANALYTICS', 'SOFTWARE_DEV']});
    expect(approvedExperienceSignal(workshop, undefined).blocked).toBe('NOT_APPROVED');
    expect(approvedExperienceSignal(workshop, {state:'INACTIVE', version:2, reason:'REVOKED'}).blocked).toBe('APPROVAL_INACTIVE');
    expect(approvedExperienceSignal({...workshop, contentVersion:2}, active(workshop, ['DATA_ANALYTICS'])).blocked).toBe('STALE_CONTENT');
    expect(approvedExperienceSignal({...workshop, consentVersion:2}, active(workshop, ['DATA_ANALYTICS'])).blocked).toBe('STALE_CONSENT');
    expect(approvedExperienceSignal({...workshop, consent:'REVOKED'}, active(workshop, ['DATA_ANALYTICS']))).toEqual({experienceId:'SYN-EXP-PYTHON', topics:[], blocked:'CONSENT_NOT_ACTIVE'});
  });

  const base:RecommendationProfile = {interestTopics:[], desiredJobTopics:['DATA_ANALYTICS', 'MARKETING_BRAND', 'AI_ML'],
    approvedExperienceTopics:['CYBERSECURITY'], approvedLanguageCodes:[], officialMajorTopics:[], facts:{enrollment:'ENROLLED'}};
  const opts = {asOf:DEMO_AS_OF, publishedAtBySnapshotId:DEMO_PUBLISHED_AT};

  it('replaces approvedExperienceTopics with current signals only; a grounded candidate alone adds nothing', () => {
    const grounded = assessSkillCandidates(workshop, [{paragraphId:'p1', quote:'Python 시각화', topicCode:'DATA_ANALYTICS'}]);
    expect(grounded[0]?.check).toBe('GROUNDED');
    expect(withApprovedExperience(base, [approvedExperienceSignal(workshop, undefined)]).approvedExperienceTopics).toEqual([]);
    expect(withApprovedExperience(base, [approvedExperienceSignal(workshop, active(workshop, ['DATA_ANALYTICS']))]).approvedExperienceTopics).toEqual(['DATA_ANALYTICS']);
  });

  it('deleting the approval removes the signal from the feed score', () => {
    const on = withApprovedExperience(base, [approvedExperienceSignal(workshop, active(workshop, ['DATA_ANALYTICS']))]);
    const off = withApprovedExperience(base, [approvedExperienceSignal(workshop, {state:'INACTIVE', version:2, reason:'NOT_APPROVED'})]);
    const exp = (p:RecommendationProfile) => composeFeed(p, DEMO_OPPORTUNITIES, opts).all
      .filter(r => r.matched.experience.length > 0).map(r => r.opportunity.id);
    expect(exp(on).length).toBeGreaterThan(0);
    expect(exp(off)).toEqual([]);
  });

  it('suggests uncovered desired topics as optional ideas with feed items, accuracy NOT_RUN', () => {
    const signals = [approvedExperienceSignal(workshop, active(workshop, ['DATA_ANALYTICS'])), approvedExperienceSignal(theater, active(theater, ['MARKETING_BRAND']))];
    const s = complementSuggestions(base, signals, DEMO_OPPORTUNITIES, opts);
    expect(s.optionalTopics).toEqual(['AI_ML']);
    expect(s.accuracy).toBe('NOT_RUN');
    expect(s.opportunities.length).toBeGreaterThan(0);
    expect(s.opportunities.length).toBeLessThanOrEqual(3);
    for (const o of s.opportunities) {
      expect(o.topics).toEqual(['AI_ML']);
      expect(DEMO_OPPORTUNITIES.find(x => x.id === o.id)?.topicCodes).toContain('AI_ML');
    }
    // Same inputs in any order → byte-identical suggestion.
    const again = complementSuggestions(base, [...signals].reverse(), [...DEMO_OPPORTUNITIES].reverse(), opts);
    expect(JSON.stringify(again)).toBe(JSON.stringify(s));
    // Revoking consent on the workshop brings DATA_ANALYTICS back as an optional idea.
    const revoked = complementSuggestions(base, [approvedExperienceSignal({...workshop, consent:'REVOKED'}, active(workshop, ['DATA_ANALYTICS'])), signals[1]!], DEMO_OPPORTUNITIES, opts);
    expect(revoked.optionalTopics).toEqual(['AI_ML', 'DATA_ANALYTICS']);
  });
});

describe('#10 replay: revoke → re-approve → content edit → consent refresh, signal follows only the current approval', () => {
  const base:RecommendationProfile = {interestTopics:[], desiredJobTopics:[], approvedExperienceTopics:[],
    approvedLanguageCodes:[], officialMajorTopics:[], facts:{enrollment:'ENROLLED'}};
  const opts = {asOf:DEMO_AS_OF, publishedAtBySnapshotId:DEMO_PUBLISHED_AT};
  const expMatched = (p:RecommendationProfile) => composeFeed(p, DEMO_OPPORTUNITIES, opts).all.filter(r => r.matched.experience.length > 0).length;
  const approval = (version:number, contentVersion:number, consentVersion:number):TagApproval =>
    ({state:'ACTIVE', version, contentVersion, consentVersion, topics:['DATA_ANALYTICS']});
  const steps:{label:string; experience:ExperienceEvidence; approval:TagApproval; topics:string[]; blocked?:string}[] = [
    {label:'approved', experience:workshop, approval:approval(1, 1, 1), topics:['DATA_ANALYTICS']},
    {label:'revoked', experience:workshop, approval:{state:'INACTIVE', version:2, reason:'REVOKED'}, topics:[], blocked:'APPROVAL_INACTIVE'},
    {label:'re-approved', experience:workshop, approval:approval(3, 1, 1), topics:['DATA_ANALYTICS']},
    {label:'content edited, old approval kept', experience:{...workshop, contentVersion:2}, approval:approval(3, 1, 1), topics:[], blocked:'STALE_CONTENT'},
    {label:'consent refreshed, approval on old consent', experience:{...workshop, contentVersion:2, consentVersion:2}, approval:approval(4, 2, 1), topics:[], blocked:'STALE_CONSENT'},
    {label:'re-approved on current versions', experience:{...workshop, contentVersion:2, consentVersion:2}, approval:approval(5, 2, 2), topics:['DATA_ANALYTICS']},
    {label:'consent withdrawn', experience:{...workshop, contentVersion:2, consentVersion:2, consent:'REVOKED'}, approval:approval(5, 2, 2), topics:[], blocked:'CONSENT_NOT_ACTIVE'},
  ];
  const withSignal = expMatched(withApprovedExperience(base, [approvedExperienceSignal(workshop, approval(1, 1, 1))]));

  it('the approved state gives a non-zero experience contribution to compare against', () => {
    expect(withSignal).toBeGreaterThan(0);
  });

  for (const [i, step] of steps.entries()) {
    it(`step ${i + 1} ${step.label}: topics ${JSON.stringify(step.topics)}, experience matches ${step.topics.length ? 'restored' : '0'}`, () => {
      const signal = approvedExperienceSignal(step.experience, step.approval);
      expect(signal.topics).toEqual(step.topics);
      expect(signal.blocked).toBe(step.blocked);
      // Each step is computed from that step's inputs alone: no earlier ACTIVE state carries over.
      expect(expMatched(withApprovedExperience(base, [signal]))).toBe(step.topics.length ? withSignal : 0);
    });
  }
});
