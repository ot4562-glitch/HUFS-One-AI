import {describe, expect, it} from 'vitest';
import {OpportunitySchema, TOPIC_CODES, type Opportunity} from '@hufs-one/contracts';
import {DEMO_NOTICES} from '../notices/demo-notices.js';
import {corpusCoverage} from './corpus-coverage.js';
import {DEMO_AS_OF, DEMO_CORPUS_VERSION, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT} from './demo-corpus.js';
import {DEMO_STUDENTS} from './demo-profiles.js';

const coverage = () => corpusCoverage({
  asOf:DEMO_AS_OF, corpusVersion:DEMO_CORPUS_VERSION, opportunities:DEMO_OPPORTUNITIES,
  publishedAtBySnapshotId:DEMO_PUBLISHED_AT, notices:DEMO_NOTICES, students:DEMO_STUDENTS,
});

describe('#10 40 opportunities + 10 academic notices: coverage of the fixed SYNTHETIC evaluation corpus', () => {
  const c = coverage();

  it('stays 100% SYNTHETIC on one fixed version and demo instant', () => {
    expect(c.corpusVersion).toBe('syn-corpus-v1');
    expect(c.asOf).toBe(DEMO_AS_OF);
    expect(c.opportunities.dataMode).toEqual({SYNTHETIC:40});
    expect(c.opportunities.applicationRoute).toEqual({DEMO_DISABLED:39, RECORD_ONLY:1});
  });

  // Counts below were derived by hand from the SPECS table in demo-corpus.ts, not copied from output.
  it('kinds, lifecycle, data quality and deadline shapes', () => {
    expect(c.opportunities.kind).toEqual({CONTEST:9, EXTRACURRICULAR:11, INTERNSHIP:7, JOB:8, SCHOLARSHIP:5});
    expect(c.opportunities.lifecycle).toEqual({CLOSED:1, OPEN:35, UNKNOWN:3, UPCOMING:1});
    expect(c.opportunities.dataQuality).toEqual({COMPLETE:37, CONFLICT:1, PARTIAL:1, STALE:1});
    expect(c.opportunities.deadline).toEqual({fixed:38, rolling:1, none:1, futurePublication:1, unknownPublication:0});
  });

  it('condition fields, selection/completion rules, events, languages and every topic', () => {
    expect(c.opportunities.conditionFields).toEqual({campus:1, certification:1, cohort:2, enrollment:10, teamRole:1});
    expect([c.opportunities.withPrioritySelection, c.opportunities.withCompletionRules]).toEqual([2, 1]);
    expect([c.opportunities.withEventSessions, c.opportunities.withLanguages]).toEqual([7, 10]);
    expect(c.opportunities.topicsCovered).toBe(TOPIC_CODES.length);
    expect(c.opportunities.topicsMissing).toEqual([]);
  });

  it('every student sees all three eligibility outcomes, so false-eligible and UNKNOWN are both measurable', () => {
    expect(c.eligibilityByStudent).toEqual({
      S01:{ELIGIBLE:34, INELIGIBLE:2, UNKNOWN:4}, S02:{ELIGIBLE:33, INELIGIBLE:3, UNKNOWN:4},
      S03:{ELIGIBLE:34, INELIGIBLE:2, UNKNOWN:4}, S04:{ELIGIBLE:33, INELIGIBLE:2, UNKNOWN:5},
      S05:{ELIGIBLE:33, INELIGIBLE:1, UNKNOWN:6},
    });
    for (const counts of Object.values(c.eligibilityByStudent)) {
      expect(counts.ELIGIBLE + counts.INELIGIBLE + counts.UNKNOWN).toBe(40);
    }
  });

  it('records the known gaps instead of hiding them: one shared group, no correction chains', () => {
    // Only one kind+organizer group repeats, so the feed per-group cap is exercised by a single pair.
    expect(c.opportunities.sharedGroups).toEqual(['CONTEST|시연가상기관b']);
    // No opportunity has a correction / cancel / extension revision chain in this corpus; correction cases
    // are covered by normalization/correction-*.test.ts, not by any metric computed on these 40 items.
    expect(c.opportunities.revisionChains).toBe(0);
  });

  it('academic notices: categories, verification, admin deadline, GPA condition, scope and events', () => {
    expect(c.notices).toEqual({
      total:10, category:{ACADEMIC:5, CAREER:1, EXCHANGE:1, SCHOLARSHIP:3}, verification:{CANDIDATE:1, VERIFIED:9},
      withAdminReportDeadline:1, withScholarshipConditions:1, withScope:3, withEventSessions:2,
    });
  });

  it('is independent of input order', () => {
    const reversed = corpusCoverage({
      asOf:DEMO_AS_OF, corpusVersion:DEMO_CORPUS_VERSION, opportunities:[...DEMO_OPPORTUNITIES].reverse(),
      publishedAtBySnapshotId:DEMO_PUBLISHED_AT, notices:[...DEMO_NOTICES].reverse(), students:[...DEMO_STUDENTS].reverse(),
    });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(c));
  });
});

describe('#10 corpusCoverage on hand-made inputs', () => {
  const opp = (id:string, snapshot:string, over:Partial<Opportunity> = {}) => OpportunitySchema.parse({
    id, version:'v1', sourceSnapshotId:snapshot, title:`가상 ${id}`, organization:'시연가상기관 Q', kind:'CONTEST',
    topicCodes:['AI_ML'], languageCodes:[], eventSessions:[], actualApplicationRoute:'DEMO_DISABLED', conditions:[],
    roleSteps:[], prioritySelection:[], completionRules:[], dataMode:'SYNTHETIC', dataQuality:'COMPLETE', ...over,
  });

  it('counts revision chains, unknown publication, shared groups and missing topics', () => {
    const r = corpusCoverage({
      asOf:DEMO_AS_OF, corpusVersion:'test', notices:[], students:[],
      opportunities:[opp('A', 'SRC-A-r1'), opp('A2', 'SRC-A-r2'), opp('B', 'SRC-B-r1', {kind:'JOB'})],
      publishedAtBySnapshotId:{'SRC-A-r1':'2026-11-01T00:00:00.000Z'},
    });
    expect(r.opportunities.revisionChains).toBe(1);
    expect(r.opportunities.deadline.unknownPublication).toBe(2);
    expect(r.opportunities.sharedGroups).toEqual(['CONTEST|시연가상기관q']);
    expect(r.opportunities.topicsCovered).toBe(1);
    expect(r.opportunities.topicsMissing).toHaveLength(TOPIC_CODES.length - 1);
    expect(r.eligibilityByStudent).toEqual({});
  });

  it('rejects an invalid asOf', () => {
    expect(() => corpusCoverage({asOf:'x', corpusVersion:'t', opportunities:[], publishedAtBySnapshotId:{}, notices:[], students:[]})).toThrow(RangeError);
  });
});
