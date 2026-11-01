import {describe, it, expect} from 'vitest';
import {CalendarResultSchema, FeedResultSchema, NoticeResultSchema} from '@hufs-one/contracts';
import {
  DEMO_AS_OF, DEMO_LABELS, DEMO_LABEL_STATUS, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT, DEMO_SPLIT, DEMO_STUDENTS,
  buildCalendar, compareRankers, composeFeed, opportunityLifecycle,
} from './index.js';
import {DEMO_NOTICES, composeNotices} from '../notices/index.js';

const opts = {asOf:DEMO_AS_OF, publishedAtBySnapshotId:DEMO_PUBLISHED_AT};

describe('A12 synthetic demo corpus invariants', () => {
  it('has 40 opportunities, at least 5 per kind, all synthetic and demo-disabled or record-only', () => {
    expect(DEMO_OPPORTUNITIES).toHaveLength(40);
    const kinds = new Map<string, number>();
    for (const o of DEMO_OPPORTUNITIES) kinds.set(o.kind, (kinds.get(o.kind) ?? 0) + 1);
    for (const k of ['JOB', 'INTERNSHIP', 'CONTEST', 'EXTRACURRICULAR', 'SCHOLARSHIP']) expect(kinds.get(k) ?? 0).toBeGreaterThanOrEqual(5);
    for (const o of DEMO_OPPORTUNITIES) {
      expect(o.id).toMatch(/^SYN-OPP-\d{3}$/);
      expect(o.dataMode).toBe('SYNTHETIC');
      expect(o.organization).toMatch(/^시연가상기관 /);
      expect(['DEMO_DISABLED', 'RECORD_ONLY']).toContain(o.actualApplicationRoute);
      for (const c of o.conditions) expect(c.evidenceId).toMatch(/^EV-SYN-OPP-/);
    }
    expect(new Set(DEMO_OPPORTUNITIES.map(o => o.id)).size).toBe(40);
  });

  it('splits 20 tuning / 20 report, stratified so every kind appears in both', () => {
    const split = (s:'TUNING'|'REPORT') => DEMO_OPPORTUNITIES.filter(o => DEMO_SPLIT[o.id] === s);
    expect(split('TUNING')).toHaveLength(20);
    expect(split('REPORT')).toHaveLength(20);
    for (const s of ['TUNING', 'REPORT'] as const) {
      expect(new Set(split(s).map(o => o.kind)).size).toBe(5);
    }
  });

  it('covers OPEN / UPCOMING / CLOSED / UNKNOWN lifecycles and the boundary cases', () => {
    const states = new Set(DEMO_OPPORTUNITIES.map(o => opportunityLifecycle(o, DEMO_AS_OF)));
    expect([...states].sort()).toEqual(['CLOSED', 'OPEN', 'UNKNOWN', 'UPCOMING']);
    const has = (pred:(o:typeof DEMO_OPPORTUNITIES[number]) => boolean) => DEMO_OPPORTUNITIES.some(pred);
    expect(has(o => o.dataQuality === 'CONFLICT')).toBe(true);
    expect(has(o => o.dataQuality === 'STALE')).toBe(true);
    expect(has(o => o.deadlineKind === 'ROLLING')).toBe(true);
    expect(has(o => o.prioritySelection.length > 0 && o.completionRules.length > 0)).toBe(true);
    expect(Object.values(DEMO_PUBLISHED_AT).some(t => Date.parse(t) > Date.parse(DEMO_AS_OF))).toBe(true); // future publication
  });

  it('has 10 academic notices: graduation 3, scholarship 3, course/exchange 4', () => {
    expect(DEMO_NOTICES).toHaveLength(10);
    const grad = DEMO_NOTICES.filter(n => n.requirementRefs?.some(r => r.startsWith('SYN-REQ-GRAD')));
    const sch = DEMO_NOTICES.filter(n => n.category === 'SCHOLARSHIP');
    expect(grad).toHaveLength(3);
    expect(sch).toHaveLength(3);
    expect(DEMO_NOTICES.length - grad.length - sch.length).toBe(4);
    for (const n of DEMO_NOTICES) expect(n.evidenceRefs.every(r => r.startsWith('EV-SYN-NOT-'))).toBe(true);
  });

  it('has 200 draft labels (40 × 5) over exactly the corpus ids', () => {
    expect(DEMO_LABEL_STATUS).toBe('AGENT_DRAFT');
    expect(DEMO_STUDENTS.map(s => s.subject)).toEqual(['S01', 'S02', 'S03', 'S04', 'S05']);
    const ids = DEMO_OPPORTUNITIES.map(o => o.id).sort();
    for (const s of DEMO_STUDENTS) {
      expect(Object.keys(DEMO_LABELS[s.subject]).sort()).toEqual(ids);
      expect(Object.values(DEMO_LABELS[s.subject]).some(v => v === 2)).toBe(true);
    }
  });
});

describe('demo corpus drives every core output through the official wire schemas', () => {
  for (const s of DEMO_STUDENTS) {
    it(`${s.subject}: feed, notices and calendar parse and are byte-stable`, () => {
      const feed = composeFeed(s.profile, DEMO_OPPORTUNITIES, opts);
      const notices = composeNotices(s.noticeStudent, DEMO_NOTICES, {asOf:DEMO_AS_OF});
      expect(FeedResultSchema.safeParse(JSON.parse(JSON.stringify(feed.feed))).success).toBe(true);
      expect(NoticeResultSchema.safeParse(JSON.parse(JSON.stringify(notices.result))).success).toBe(true);
      const calendar = buildCalendar(feed, notices, DEMO_NOTICES, {asOf:DEMO_AS_OF});
      expect(CalendarResultSchema.safeParse(calendar).success).toBe(true);
      // Future-published SYN-OPP-038 is never shown in a demo view.
      expect(feed.all.map(r => r.opportunity.id)).not.toContain('SYN-OPP-038');
      const again = composeFeed(s.profile, [...DEMO_OPPORTUNITIES].reverse(), opts);
      expect(JSON.stringify(again.feed)).toBe(JSON.stringify(feed.feed));
    });
  }

  it('the A15.1 comparison runs on the REPORT split (numbers are draft-label evidence only)', () => {
    const report = DEMO_OPPORTUNITIES.filter(o => DEMO_SPLIT[o.id] === 'REPORT');
    const profiles = DEMO_STUDENTS.map(s => ({profileId:s.subject, profile:s.profile, labels:DEMO_LABELS[s.subject]}));
    const r = compareRankers(profiles, report, opts);
    expect(r.profiles).toHaveLength(5);
    expect(r.rankConfigVersion).toBe('rank-v1.0');
    expect(Number.isFinite(r.deltaP3Points)).toBe(true);
  });
});
