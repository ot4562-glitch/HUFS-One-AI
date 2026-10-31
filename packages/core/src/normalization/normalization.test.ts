import {describe, it, expect} from 'vitest';
import {OpportunitySchema, type Opportunity} from '@hufs-one/contracts';
import {findDuplicateCandidates, normalizeTopicTerm, normalizeTopicTerms, onlyKnownTopics, opportunityDedupeKey} from './index.js';

describe('TASK-06 topic normalization (A04.1)', () => {
  it('accepts exact codes and explicit shared aliases only', () => {
    expect(normalizeTopicTerm('DATA_ANALYTICS')).toMatchObject({status:'MATCHED', code:'DATA_ANALYTICS', via:'CODE'});
    expect(normalizeTopicTerm(' data_analytics ')).toMatchObject({status:'MATCHED', code:'DATA_ANALYTICS'});
    expect(normalizeTopicTerm('데이터 분석')).toMatchObject({status:'MATCHED', code:'DATA_ANALYTICS', via:'ALIAS'});
    expect(normalizeTopicTerm('해외영업')).toMatchObject({status:'MATCHED', code:'GLOBAL_SALES'});
  });

  it('does not guess: free text, 기타 and near-miss wording stay UNKNOWN', () => {
    for (const raw of ['기타', '데이터 사이언스 쪽?', '', 'PREDICTED_SKILL']) {
      expect(normalizeTopicTerm(raw).status).toBe('UNKNOWN');
    }
  });

  it('broad Forms choices become candidates that need confirmation, not interests', () => {
    expect(normalizeTopicTerm('경제/금융')).toEqual({
      status:'CANDIDATES', raw:'경제/금융', codes:['ECONOMIC_RESEARCH', 'FINANCE_INVESTMENT'], needsConfirmation:true,
    });
    const r = normalizeTopicTerms(['경제/금융', 'FINANCE_INVESTMENT'], 5);
    expect(r.topics).toEqual(['FINANCE_INVESTMENT']);
    expect(r.candidates).toEqual(['ECONOMIC_RESEARCH']);
  });

  it('deduplicates and reports overflow beyond the limit instead of silently dropping it', () => {
    const r = normalizeTopicTerms(['무역', 'TRADE_OVERSEAS', '해외영업', '데이터분석', '소프트웨어개발', '기타'], 3);
    expect(r).toEqual({
      topics:['TRADE_OVERSEAS', 'GLOBAL_SALES', 'DATA_ANALYTICS'], candidates:[],
      unknown:['기타'], overflow:['SOFTWARE_DEV'],
    });
  });

  it('onlyKnownTopics drops values outside the closed enum', () => {
    expect(onlyKnownTopics(['AI_ML', 'AI_ML', 'X', 3, null])).toEqual(['AI_ML']);
  });
});

describe('TASK-06 duplicate candidates (A05.1)', () => {
  const base = (id:string, over:Partial<Opportunity> = {}) => OpportunitySchema.parse({
    id, version:'v1', sourceSnapshotId:`S-${id}`, title:'가상 데이터 공모전', organization:'시연가상기관 A',
    kind:'CONTEST', topicCodes:[], languageCodes:[], applyClosesAt:'2026-12-01T00:00:00.000Z', eventSessions:[],
    actualApplicationRoute:'DEMO_DISABLED', conditions:[], roleSteps:[], prioritySelection:[], completionRules:[],
    dataMode:'SYNTHETIC', dataQuality:'COMPLETE', ...over,
  });

  it('groups same url/organizer/title/dates for review without merging', () => {
    const items = [base('B', {title:'가상  데이터 공모전 '}), base('A'), base('C', {organization:'시연가상기관 B'})];
    const urls = {'S-A':'https://example.org/demo/1#top', 'S-B':'https://EXAMPLE.org/demo/1/'};
    expect(findDuplicateCandidates(items, urls)).toEqual([['A', 'B']]);
    expect(items).toHaveLength(3);
  });

  it('a re-post with changed apply dates is not silently treated as the same', () => {
    const a = base('A');
    const b = base('B', {applyClosesAt:'2026-12-08T00:00:00.000Z'});
    expect(opportunityDedupeKey(a)).not.toBe(opportunityDedupeKey(b));
    expect(findDuplicateCandidates([a, b])).toEqual([]);
  });
});
