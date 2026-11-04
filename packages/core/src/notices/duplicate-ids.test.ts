import {describe, it, expect} from 'vitest';
import {CalendarResultSchema, FeedResultSchema, NoticeResultSchema} from '@hufs-one/contracts';
import {DEMO_NOTICES, composeNotices, type NoticeStudent} from './index.js';
import {
  DEMO_AS_OF, DEMO_CLUB_POSTS, DEMO_CLUB_PROFILES, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT, DEMO_STUDENTS,
  buildCalendar, composeClubBoard, composeFeed, explainNotFeatured, findVisibleClubPost,
} from '../opportunities/index.js';

/**
 * #52 (김채윤): the same id arriving twice — e.g. two revisions of one notice/posting slipping past the source
 * gate — must never yield two rows. Every copy is excluded with a reason; the core never guesses which copy
 * is current. Applies to notices, the feed (incl. not-featured reasons and calendar) and the club board.
 */
const student:NoticeStudent = {openRequirementIds:null, courseIds:[], interestTopics:[]};
const opts = {asOf:DEMO_AS_OF, publishedAtBySnapshotId:DEMO_PUBLISHED_AT};
const ids = (xs:readonly {noticeId:string}[]) => xs.map(x => x.noticeId);

describe('#52 duplicate notice ids', () => {
  const first = DEMO_NOTICES[0]!;
  const withCopy = [...DEMO_NOTICES, {...first, title:'가상 정정본', sourceSnapshotId:`${first.sourceSnapshotId}-dup`}];

  it('excludes every copy with DUPLICATE_ID and keeps all other notices', () => {
    const r = composeNotices(student, withCopy, {asOf:DEMO_AS_OF});
    expect(ids(r.result.items)).not.toContain(first.id);
    expect(r.excluded.filter(x => x.noticeId === first.id)).toEqual([
      {noticeId:first.id, reason:'DUPLICATE_ID'}, {noticeId:first.id, reason:'DUPLICATE_ID'}]);
    const baseline = composeNotices(student, DEMO_NOTICES, {asOf:DEMO_AS_OF});
    expect(ids(r.result.items)).toEqual(ids(baseline.result.items).filter(id => id !== first.id));
  });

  it('output noticeIds are unique, pins never point at a duplicate, and the wire still parses', () => {
    const r = composeNotices(student, [...withCopy, ...DEMO_NOTICES], {asOf:DEMO_AS_OF}); // every id duplicated
    expect(r.result.items).toEqual([]);
    expect(r.result.pinnedIds).toEqual([]);
    expect(NoticeResultSchema.safeParse(r.result).success).toBe(true);
    const ok = composeNotices(student, withCopy, {asOf:DEMO_AS_OF});
    expect(new Set(ids(ok.result.items)).size).toBe(ok.result.items.length);
    expect(ok.result.pinnedIds.every(id => id !== first.id)).toBe(true);
  });
});

describe('#52 duplicate opportunity ids', () => {
  const s01 = DEMO_STUDENTS[0]!;
  const dupId = 'SYN-OPP-002'; // a featured card for S01
  const original = DEMO_OPPORTUNITIES.find(o => o.id === dupId)!;
  const withCopy = [...DEMO_OPPORTUNITIES, {...original, title:'가상 정정본', sourceSnapshotId:'SYN-SRC-002-r2'}];

  it('does not crash the whole feed; every copy is excluded and reported', () => {
    const f = composeFeed(s01.profile, withCopy, opts);
    expect(f.excludedDuplicateIds).toEqual([dupId]);
    expect([...f.all, ...f.closed, ...f.ineligible, ...f.excludedFuture].some(r => r.opportunity.id === dupId)).toBe(false);
    expect(FeedResultSchema.safeParse(JSON.parse(JSON.stringify(f.feed))).success).toBe(true);
    expect(composeFeed(s01.profile, DEMO_OPPORTUNITIES, opts).excludedDuplicateIds).toEqual([]);
  });

  it('not-featured reasons and the calendar never list a duplicated id (even if the student hid it)', () => {
    const r = explainNotFeatured(s01.profile, withCopy, {...opts, hiddenOpportunityIds:[dupId]});
    expect([...r.featuredIds, ...r.items.map(i => i.opportunityId)]).not.toContain(dupId);
    const feed = composeFeed(s01.profile, withCopy, opts);
    const notices = composeNotices(student, DEMO_NOTICES, {asOf:DEMO_AS_OF});
    const calendar = buildCalendar(feed, notices, DEMO_NOTICES, {asOf:DEMO_AS_OF});
    expect(CalendarResultSchema.safeParse(calendar).success).toBe(true);
    expect(JSON.stringify(calendar)).not.toContain(dupId);
  });
});

describe('#52 duplicate club post ids', () => {
  const profile = DEMO_CLUB_PROFILES[0]!.profile;
  const post = DEMO_CLUB_POSTS.find(p => p.id === 'SYN-CLUB-005')!; // recommended for S01
  const withCopy = [...DEMO_CLUB_POSTS, {...post, summary:'가상 수정본'}];

  it('hides every copy from the list, the highlights and the direct lookup', () => {
    const b = composeClubBoard(profile, withCopy, {asOf:DEMO_AS_OF});
    expect(b.all.some(r => r.post.id === post.id)).toBe(false);
    expect(b.recommended.some(r => r.post.id === post.id)).toBe(false);
    expect(findVisibleClubPost(withCopy, post.id, DEMO_AS_OF)).toBeUndefined();
    expect(findVisibleClubPost(DEMO_CLUB_POSTS, post.id, DEMO_AS_OF)?.id).toBe(post.id);
  });
});
