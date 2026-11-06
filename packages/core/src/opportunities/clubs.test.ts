import {describe, it, expect} from 'vitest';
import {
  CLUB_CATEGORIES, DEMO_AS_OF, DEMO_CLUB_POSTS, DEMO_CLUB_PROFILES, clubHiddenReason, composeClubBoard, findVisibleClubPost,
  scopeInputsToGrant, DEMO_STUDENTS, demoClubProfile, type ClubPost, type ClubProfile,
} from './index.js';

const opts = {asOf:DEMO_AS_OF};
const profileOf = (s:string) => DEMO_CLUB_PROFILES.find(p => p.subject === s)!.profile;
const ids = (rs:{post:ClubPost}[]) => rs.map(r => r.post.id);
const DAY = 86_400_000;
const at = (days:number) => new Date(Date.parse(DEMO_AS_OF) + days * DAY).toISOString();

describe('#123 synthetic club corpus', () => {
  it('has ≥ 10 approved synthetic posts in ≥ 7 categories, fictional names, one poster each', () => {
    const approved = DEMO_CLUB_POSTS.filter(p => p.state === 'APPROVED' && clubHiddenReason(p, DEMO_AS_OF) === undefined);
    expect(approved.length).toBeGreaterThanOrEqual(10);
    expect(new Set(approved.map(p => p.category)).size).toBeGreaterThanOrEqual(7);
    for (const p of DEMO_CLUB_POSTS) {
      expect(p.id).toMatch(/^SYN-CLUB-\d{3}$/);
      expect(p.clubName).toMatch(/^가상동아리 /);
      expect(p.posterAssetId).toBe(`SYN-POSTER-CLUB-${p.id.slice(-3)}`);
      expect(p.dataMode).toBe('SYNTHETIC');
      expect(CLUB_CATEGORIES).toContain(p.category);
      for (const c of p.conditions) expect(c.evidenceId).toMatch(/^EV-SYN-CLUB-/);
    }
    expect(new Set(DEMO_CLUB_POSTS.map(p => p.id)).size).toBe(DEMO_CLUB_POSTS.length);
    // Undecided deadline (미정) and a closed post are both present.
    expect(DEMO_CLUB_POSTS.some(p => p.state === 'APPROVED' && p.recruitClosesAt === undefined)).toBe(true);
  });
});

describe('#123 approval gate: only APPROVED, known at asOf — list, recommendation and direct URL', () => {
  const hidden = ['SYN-CLUB-013', 'SYN-CLUB-014', 'SYN-CLUB-015', 'SYN-CLUB-016', 'SYN-CLUB-017', 'SYN-CLUB-018'];

  it('DRAFT / REVIEW_PENDING / REJECTED / REVOKED / approved-after-asOf never appear anywhere', () => {
    expect(hidden.map(id => clubHiddenReason(DEMO_CLUB_POSTS.find(p => p.id === id)!, DEMO_AS_OF)))
      .toEqual(['NOT_APPROVED', 'NOT_APPROVED', 'NOT_APPROVED', 'NOT_APPROVED', 'APPROVAL_AFTER_ASOF', 'EDITED_AFTER_APPROVAL']);
    for (const {profile} of DEMO_CLUB_PROFILES) {
      const b = composeClubBoard(profile, DEMO_CLUB_POSTS, opts);
      for (const id of hidden) {
        expect(ids(b.all)).not.toContain(id);
        expect(ids(b.recommended)).not.toContain(id);
        expect(findVisibleClubPost(DEMO_CLUB_POSTS, id, DEMO_AS_OF)).toBeUndefined();
      }
    }
  });

  it('state transitions: approve → visible, revoke / expire → gone; a client flag without approvedAt is not enough', () => {
    const base = DEMO_CLUB_POSTS.find(p => p.id === 'SYN-CLUB-014')!; // REVIEW_PENDING
    const approved:ClubPost = {...base, state:'APPROVED', approvedAt:at(-1)};
    expect(findVisibleClubPost([approved], approved.id, DEMO_AS_OF)?.id).toBe(approved.id);
    for (const state of ['REVOKED', 'EXPIRED', 'REJECTED', 'DRAFT'] as const)
      expect(findVisibleClubPost([{...approved, state}], approved.id, DEMO_AS_OF)).toBeUndefined();
    // "APPROVED" set without an admin approval time (e.g. a client-written flag) stays hidden.
    const {approvedAt:_x, ...selfFlag} = approved;
    expect(clubHiddenReason(selfFlag, DEMO_AS_OF)).toBe('NOT_APPROVED');
    // Replay before the approval: hidden at that asOf.
    expect(clubHiddenReason(approved, at(-2))).toBe('APPROVAL_AFTER_ASOF');
    expect(clubHiddenReason({...approved, createdAt:at(1), updatedAt:at(1), approvedAt:at(2)}, DEMO_AS_OF)).toBe('CREATED_AFTER_ASOF');
    expect(clubHiddenReason({...approved, recruitClosesAt:'not-a-date'}, DEMO_AS_OF)).toBe('INVALID_TIME');
  });

  it('#125 review: a post edited after asOf or after its approval is absent from the list, highlights and direct lookup', () => {
    const base = DEMO_CLUB_POSTS.find(p => p.id === 'SYN-CLUB-005')!; // approved, recommended for S01
    const s01 = profileOf('S01');
    expect(ids(composeClubBoard(s01, [base], opts).recommended)).toEqual(['SYN-CLUB-005']);
    const cases:[string, ClubPost, string][] = [
      // Replaying an earlier asOf must not serve the later-edited summary/poster/conditions.
      ['future edit', {...base, updatedAt:at(1), summary:'나중에 바뀐 소개', posterAssetId:'SYN-POSTER-CLUB-005-v2'}, 'EDITED_AFTER_ASOF'],
      // Edited after the approval it claims: the new content was never reviewed.
      ['edit after approval', {...base, approvedAt:at(-5), updatedAt:at(-1)}, 'EDITED_AFTER_APPROVAL'],
      ['approved before created', {...base, approvedAt:at(-30)}, 'INVALID_CHRONOLOGY'],
      ['edited before created', {...base, updatedAt:at(-30)}, 'INVALID_CHRONOLOGY'],
    ];
    for (const [name, post, reason] of cases) {
      expect([name, clubHiddenReason(post, DEMO_AS_OF)]).toEqual([name, reason]);
      const b = composeClubBoard(s01, [post], opts);
      expect([name, ids(b.all), ids(b.recommended)]).toEqual([name, [], []]);
      expect([name, findVisibleClubPost([post], post.id, DEMO_AS_OF)]).toEqual([name, undefined]);
    }
    // Re-approved after the edit: visible again with the new content.
    const reapproved:ClubPost = {...base, updatedAt:at(-1), approvedAt:at(-1)};
    expect(findVisibleClubPost([reapproved], base.id, DEMO_AS_OF)).toBe(reapproved);
  });
});

describe('#123 recommendations: up to 3, explained, different per profile, full list kept', () => {
  it('fixed regression for the five synthetic profiles', () => {
    const rec = Object.fromEntries(DEMO_CLUB_PROFILES.map(({subject, profile}) =>
      [subject, ids(composeClubBoard(profile, DEMO_CLUB_POSTS, opts).recommended)]));
    expect(rec).toEqual({
      S01:['SYN-CLUB-005', 'SYN-CLUB-009', 'SYN-CLUB-003'],
      S02:['SYN-CLUB-001', 'SYN-CLUB-004'],
      S03:['SYN-CLUB-003', 'SYN-CLUB-008'],
      S04:['SYN-CLUB-009', 'SYN-CLUB-004', 'SYN-CLUB-012'],
      S05:['SYN-CLUB-008', 'SYN-CLUB-010', 'SYN-CLUB-009'],
    });
    expect(new Set(Object.values(rec).map(r => r.join())).size).toBe(5);
  });

  it('keeps every visible post in the list; recruitable first, closed last; recommendations are a subset', () => {
    for (const {profile} of DEMO_CLUB_PROFILES) {
      const b = composeClubBoard(profile, DEMO_CLUB_POSTS, opts);
      expect(b.all).toHaveLength(12);
      expect(b.all.at(-1)!.post.id).toBe('SYN-CLUB-011'); // closed
      for (const r of b.recommended) expect(b.all).toContain(r);
      expect(b).toMatchObject({asOf:DEMO_AS_OF, configVersion:'club-v1.0', provenance:'CODE_RULES'});
      // At most one per category in the highlighted cards; never a closed or ineligible one.
      expect(new Set(b.recommended.map(r => r.post.category)).size).toBe(b.recommended.length);
      for (const r of b.recommended) {
        expect(r.relevant).toBe(true);
        expect(r.lifecycle).not.toBe('CLOSED');
        expect(r.eligibility).not.toBe('INELIGIBLE');
        expect(r.reasons.some(x => ['INTEREST_MATCH', 'EXPERIENCE_MATCH', 'ACTIVITY_MATCH'].includes(x.code))).toBe(true);
      }
    }
  });

  it('unknown conditions are 확인 필요 and 미정 deadlines are said, never assumed', () => {
    const s04 = composeClubBoard(profileOf('S04'), DEMO_CLUB_POSTS, opts);
    const music = s04.all.find(r => r.post.id === 'SYN-CLUB-012')!;
    expect(music).toMatchObject({eligibility:'UNKNOWN', fields:['time']});
    expect(music.reasons.find(r => r.code === 'CHECK_NEEDED')!.text).toMatch(/확인 필요/);
    const s05 = composeClubBoard(profileOf('S05'), DEMO_CLUB_POSTS, opts);
    const green = s05.all.find(r => r.post.id === 'SYN-CLUB-010')!;
    expect(green.lifecycle).toBe('OPEN_NO_DEADLINE');
    expect(green.reasons.map(r => r.code)).toContain('DEADLINE_UNKNOWN');
  });

  it('a failed stated condition keeps the post in the list but out of the highlights', () => {
    const p:ClubProfile = {...profileOf('S01'), facts:{...profileOf('S01').facts, cohort:2020}};
    const b = composeClubBoard(p, DEMO_CLUB_POSTS, opts);
    const code = b.all.find(r => r.post.id === 'SYN-CLUB-006')!;
    expect(code).toMatchObject({eligibility:'INELIGIBLE', fields:['cohort']});
    expect(ids(b.recommended)).not.toContain('SYN-CLUB-006');
  });

  it('no personal input: nothing is highlighted (no popularity fallback), the list stays', () => {
    const blank:ClubProfile = {interestTopics:[], approvedExperienceTopics:[], desiredActivities:[], facts:{}};
    const b = composeClubBoard(blank, DEMO_CLUB_POSTS, opts);
    expect(b.recommended).toEqual([]);
    expect(b.all).toHaveLength(12);
    expect(b.all.every(r => r.reasons[0]!.code === 'NO_PERSONAL_MATCH')).toBe(true);
  });

  it('unshared experience is not used: scoped profile drops EXPERIENCE_MATCH and its score', () => {
    const s01 = DEMO_STUDENTS.find(s => s.subject === 'S01')!;
    const scoped = scopeInputsToGrant(s01.profile, s01.noticeStudent, ['FEED', 'NOTICES']);
    const p = demoClubProfile({...s01, profile:scoped.profile!});
    const b = composeClubBoard(p, DEMO_CLUB_POSTS, opts);
    expect(b.all.flatMap(r => r.reasons.map(x => x.code))).not.toContain('EXPERIENCE_MATCH');
    expect(b.all.every(r => r.score.S === 0)).toBe(true);
  });

  it('is byte-stable and independent of input order', () => {
    const a = composeClubBoard(profileOf('S01'), DEMO_CLUB_POSTS, opts);
    const b = composeClubBoard(profileOf('S01'), [...DEMO_CLUB_POSTS].reverse(), opts);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('asOf moves lifecycle: after a deadline the post closes and leaves the highlights', () => {
    const s01 = profileOf('S01');
    const later = at(9); // SYN-CLUB-005 closes at +8 days
    const b = composeClubBoard(s01, DEMO_CLUB_POSTS, {asOf:later});
    expect(b.all.find(r => r.post.id === 'SYN-CLUB-005')!.lifecycle).toBe('CLOSED');
    expect(ids(b.recommended)).not.toContain('SYN-CLUB-005');
    // The post approved "tomorrow" becomes visible once asOf passes its approval.
    expect(ids(b.all)).toContain('SYN-CLUB-017');
  });
});

describe('#10 club replay: approve → revoke → edit → re-approve as successive server snapshots', () => {
  const base = DEMO_CLUB_POSTS.find(p => p.id === 'SYN-CLUB-014')!;
  const approved:ClubPost = {...base, state:'APPROVED', createdAt:at(-10), updatedAt:at(-6), approvedAt:at(-5)};
  const revoked:ClubPost = {...approved, state:'REVOKED', updatedAt:at(-3)};
  const reapproved:ClubPost = {...approved, summary:`${base.summary} (수정)`, updatedAt:at(-2), approvedAt:at(-1)};
  const shown = (post:ClubPost, asOf:string) => composeClubBoard(profileOf('S01'), [post], {asOf}).all.map(r => r.post.id);

  it('the first approval is visible only from its approval time', () => {
    expect(clubHiddenReason(approved, at(-5.5))).toBe('APPROVAL_AFTER_ASOF');
    expect(shown(approved, at(-4))).toEqual([approved.id]);
  });

  it('the revoked snapshot is hidden at every asOf', () => {
    for (const d of [-4, -2, 0]) expect(shown(revoked, at(d))).toEqual([]);
  });

  it('the re-approved snapshot never revives the post between revocation and re-approval', () => {
    // Between the edit and the new approval the earlier approval must not count.
    expect(clubHiddenReason(reapproved, at(-1.5))).toBe('APPROVAL_AFTER_ASOF');
    // Before the edit, replaying with the new snapshot is unknowable content.
    expect(clubHiddenReason(reapproved, at(-2.5))).toBe('EDITED_AFTER_ASOF');
    expect(shown(reapproved, at(-1.5))).toEqual([]);
    expect(shown(reapproved, at(0))).toEqual([reapproved.id]);
  });

  it('an edit after the re-approval hides it again until a newer approval', () => {
    expect(clubHiddenReason({...reapproved, updatedAt:at(-0.5)}, DEMO_AS_OF)).toBe('EDITED_AFTER_APPROVAL');
  });
});
