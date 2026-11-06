// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {DemoSnapshotSchema, type DemoSnapshot} from '@hufs-one/contracts';
import snapshotJson from '../../../../../packages/fixtures/synthetic/demo-snapshot.json';
import {DEMO_AS_OF, DEMO_CLUB_POSTS, DEMO_STUDENTS, composeClubBoard, demoClubProfile} from '../../../../../packages/core/src/opportunities/index.js';
import {buildClubBoard, type ClubCardView} from '../clubs/clubView.js';
import {ClubPoster} from '../clubs/ClubPoster.js';
import {buildDemoScreenView, type FeedCardView} from '../demo/sectionView.js';
import {OppCard} from '../../pages/homeParts.js';
import {ARTWORK, clubArtwork, opportunityArtwork} from './artwork.js';
import {SyntheticArtwork} from './SyntheticArtwork.js';
import {SYNTHETIC_EXAMPLES, SyntheticExampleGallery} from './SyntheticExampleGallery.js';

afterEach(cleanup);

function club(id: string): ClubCardView {
  const board = composeClubBoard(demoClubProfile(DEMO_STUDENTS[0]!), DEMO_CLUB_POSTS, {asOf: DEMO_AS_OF});
  const result = buildClubBoard(board, DEMO_AS_OF);
  if (!result.ok) throw new Error('Synthetic club board was rejected');
  const found = result.view.all.find(c => c.id === id);
  if (!found) throw new Error('Expected synthetic club is not visible');
  return found;
}

function firstCard(snapshot: DemoSnapshot): FeedCardView {
  const feed = buildDemoScreenView(snapshot, ['FEED']).feed;
  if (feed.kind !== 'SHOW' || !feed.data.featured[0]) throw new Error('Expected a visible synthetic fixture card');
  return feed.data.featured[0];
}

describe('#296 synthetic artwork provenance', () => {
  it('requires both the exact known club ID and its unchanged poster identity', () => {
    expect(clubArtwork(club('SYN-CLUB-005'))).toBe(ARTWORK.technology);
    for (const value of [
      {id: 'REAL-CLUB-005', posterSeed: 'SYN-POSTER-CLUB-005'},
      {id: 'SYN-CLUB-005', posterSeed: 'REAL-POSTER-005'},
      {id: 'SYN-CLUB-005', posterSeed: 'SYN-POSTER-CLUB-006'},
      {id: 'SYN-CLUB-005', posterSeed: 'SYN-POSTER-CLUB-005-r2'},
      {id: 'SYN-CLUB-011', posterSeed: 'SYN-POSTER-CLUB-011'},
      {id: 'SYN-CLUB-090', posterSeed: 'SYN-POSTER-CLUB-090'},
      {id: 'SYN-CLUB-5', posterSeed: 'SYN-POSTER-CLUB-5'},
    ]) expect(clubArtwork(value)).toBeUndefined();
  });

  it('does not attach artwork to real data, even if it reuses a known synthetic opportunity ID', () => {
    const snapshot = DemoSnapshotSchema.parse(snapshotJson);
    const original = firstCard(snapshot);
    expect(opportunityArtwork(original)).toBeDefined();
    const real = firstCard({...snapshot, datasetMode: 'REAL_CONSENTED', feed: {
      ...snapshot.feed,
      featured: [{...snapshot.feed.featured[0]!, dataMode: 'REAL'}],
    }});
    expect(real.opportunityId).toBe(original.opportunityId);
    expect(real.badges).toEqual([]);
    expect(opportunityArtwork(real)).toBeUndefined();
    const {container} = render(<ul><OppCard card={real} navigate={vi.fn()} /></ul>);
    expect(container.querySelector('picture')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('heading', {name: real.title})).toBeTruthy();
  });

  it('leaves unknown and malformed opportunity IDs unillustrated', () => {
    for (const opportunityId of ['REAL-OPP-001', 'SYN-OPP-000', 'SYN-OPP-041', 'SYN-OPP-999', 'SYN-OPP-1', 'SYN-OPP-001-r2']) {
      expect(opportunityArtwork({opportunityId, badges: ['합성 공고']})).toBeUndefined();
    }
    expect(opportunityArtwork({opportunityId: 'SYN-OPP-001', badges: ['AI 예시(모의)']})).toBeUndefined();
    const card = {...firstCard(DemoSnapshotSchema.parse(snapshotJson)), opportunityId: 'SYN-OPP-041'};
    const {container} = render(<ul><OppCard card={card} navigate={vi.fn()} /></ul>);
    expect(container.querySelector('picture')).toBeNull();
    expect(screen.getByRole('heading', {name: card.title})).toBeTruthy();
  });
});

describe('#296 artwork loading and accessible semantics', () => {
  it('exposes responsive local WebP candidates, stable dimensions, descriptive alt and a visible synthetic label', () => {
    const {container} = render(<SyntheticArtwork art={ARTWORK.language} />);
    const img = screen.getByRole('img', {name: ARTWORK.language.alt});
    expect(img.getAttribute('src')).toBe(ARTWORK.language.small);
    expect(img.getAttribute('width')).toBe('960');
    expect(img.getAttribute('height')).toBe('540');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    const source = container.querySelector('picture source')!;
    expect(source.getAttribute('type')).toBe('image/webp');
    expect(source.getAttribute('srcset')).toBe(`${ARTWORK.language.small} 480w, ${ARTWORK.language.large} 960w`);
    expect(source.getAttribute('sizes')).toContain('(max-width: 767px) 90vw');
    expect(source.getAttribute('sizes')).toContain('(max-width: 1199px) 45vw');
    expect(source.getAttribute('sizes')).toMatch(/420px$/);
    expect(container.querySelector('figcaption')?.textContent).toBe('합성 예시 · 실제 모집 아님');
    for (const art of Object.values(ARTWORK)) {
      expect(art.alt).toContain('합성');
      expect(art.small).toMatch(/-480\.webp$/);
      expect(art.large).toMatch(/-960\.webp$/);
    }
  });

  it('replaces a broken generic image with an accessible synthetic missing-image state', () => {
    const {container} = render(<SyntheticArtwork art={ARTWORK.media} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img', {name: '합성 예시 이미지 없음'}).textContent).toContain('합성 예시 · 이미지 없음');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('picture')).toBeNull();
  });

  it('falls back to the current club fields after a load error and resets when the poster identity changes', () => {
    const first = club('SYN-CLUB-005');
    const {container, rerender} = render(<ClubPoster club={first} size="detail" />);
    fireEvent.error(screen.getByRole('img', {name: ARTWORK.technology.alt}));
    const fallback = screen.getByRole('img', {name: `${first.name} 가상 포스터 (데모)`});
    expect(fallback.tagName.toLowerCase()).toBe('svg');
    expect(fallback.textContent).toContain(first.lifecycleText);
    expect(fallback.textContent).toContain('가상 동아리 · 데모');
    expect(container.querySelector('img')).toBeNull();
    const next = club('SYN-CLUB-006'); // Same artwork theme, different exact post identity.
    rerender(<ClubPoster club={next} size="detail" />);
    expect(screen.getByRole('img', {name: ARTWORK.technology.alt}).tagName.toLowerCase()).toBe('img');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the SVG fallback immediately for an unapproved poster identity', () => {
    const unknownPoster = {...club('SYN-CLUB-005'), posterSeed: 'SYN-POSTER-CLUB-005-r2'};
    const {container} = render(<ClubPoster club={unknownPoster} />);
    const fallback = screen.getByRole('img', {name: `${unknownPoster.name} 가상 포스터 (데모)`});
    expect(fallback.tagName.toLowerCase()).toBe('svg');
    expect(fallback.textContent).toContain('가상 동아리 · 데모');
    expect(container.querySelector('picture')).toBeNull();
  });
});

describe('#296 display-only examples and card decisions', () => {
  it('keeps eligibility, closure, recommendation text and navigation unchanged when art loads or fails', () => {
    const snapshot = DemoSnapshotSchema.parse(snapshotJson);
    const card: FeedCardView = {...firstCard({...snapshot, feed: {...snapshot.feed, featured: [{
      ...snapshot.feed.featured[0]!, eligibility: 'UNKNOWN', lifecycle: 'CLOSED',
    }]}}), reasons: ['승인한 경험 주제가 공고 분야와 겹쳐요.'],
    relevance: {text: '관련도 42 · 관심 분야 참고', disclaimer: '지원 적격이나 합격 확률이 아닙니다.'}};
    const before = JSON.stringify(card);
    Object.freeze(card);
    Object.freeze(card.badges);
    const navigate = vi.fn();
    const {container} = render(<ul><OppCard card={card} navigate={navigate} /></ul>);
    expect(container.querySelector('.opp__elig')?.textContent).toContain('자격 확인 필요');
    expect(container.querySelector('.opp__side .mchip')?.textContent).toBe('마감');
    expect(container.querySelector('.opp__why')?.textContent).toContain(card.reasons[0]);
    expect(container.querySelector('.card__disclaimer')?.textContent).toBe(card.relevance!.disclaimer);
    expect(screen.queryByText('지원 조건 충족')).toBeNull();
    expect(screen.queryByRole('button', {name: /지원|신청/})).toBeNull();
    fireEvent.error(screen.getByRole('img'));
    expect(container.querySelector('.opp__elig')?.textContent).toContain('자격 확인 필요');
    expect(container.querySelector('.opp__side .mchip')?.textContent).toBe('마감');
    expect(container.querySelector('.opp__why')?.textContent).toContain(card.reasons[0]);
    expect(container.querySelector('.card__disclaimer')?.textContent).toBe(card.relevance!.disclaimer);
    const detail = screen.getByRole('link', {name: /^자세히 보기/});
    expect(detail.textContent).toContain(card.title);
    fireEvent.click(detail);
    expect(navigate).toHaveBeenCalledWith(`/opportunities/${card.opportunityId}`);
    expect(JSON.stringify(card)).toBe(before);
  });

  it('keeps twelve distinct illustrative examples across themes, audiences, campuses and recruitment states', () => {
    const examples = [...SYNTHETIC_EXAMPLES.clubs, ...SYNTHETIC_EXAMPLES.opportunities];
    expect(SYNTHETIC_EXAMPLES.clubs).toHaveLength(6);
    expect(SYNTHETIC_EXAMPLES.opportunities).toHaveLength(6);
    expect(new Set(examples.map(e => e.title)).size).toBe(12);
    expect(new Set(examples.map(e => e.art)).size).toBe(8);
    expect(new Set(SYNTHETIC_EXAMPLES.opportunities.map(e => e.kind))).toEqual(new Set(['공모전', '대외활동', '장학', '인턴', '채용', '연구·탐색']));
    expect(new Set(examples.map(e => e.campus))).toEqual(new Set(['서울', '글로벌', '두 캠퍼스']));
    expect(new Set(examples.map(e => e.timing))).toEqual(new Set(['모집 중', '상시 모집', '모집 예정', '모집 마감', '마감 미정']));
    expect(examples.some(e => e.audience === '1–2학년 입문')).toBe(true);
    expect(examples.some(e => e.audience === '3–4학년')).toBe(true);
    expect(examples.some(e => e.audience === '졸업예정자')).toBe(true);
    expect(examples.some(e => e.audience === '자격 추가 확인')).toBe(true);
  });

  it('keeps galleries separate from actual cards, labels every illustration, and offers no application action', () => {
    const boardBefore = composeClubBoard(demoClubProfile(DEMO_STUDENTS[0]!), DEMO_CLUB_POSTS, {asOf: DEMO_AS_OF});
    const {container} = render(<><SyntheticExampleGallery kind="clubs" /><SyntheticExampleGallery kind="opportunities" /></>);
    const galleries = container.querySelectorAll('details');
    expect(galleries).toHaveLength(2);
    for (const gallery of Array.from(galleries)) {
      expect(gallery.open).toBe(false);
      expect(gallery.querySelector('summary')?.textContent).toContain('합성');
      gallery.open = true;
      expect(within(gallery).getAllByRole('listitem')).toHaveLength(6);
      expect(within(gallery).getAllByRole('img')).toHaveLength(6);
      expect(within(gallery).getAllByText('합성 예시 · 실제 모집 아님')).toHaveLength(6);
      expect(gallery.textContent).toContain('실제 모집·지원 대상이 아니며 신청할 수 없어요.');
    }
    expect(screen.getAllByRole('heading', {level: 3})).toHaveLength(12);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const boardAfter = composeClubBoard(demoClubProfile(DEMO_STUDENTS[0]!), DEMO_CLUB_POSTS, {asOf: DEMO_AS_OF});
    expect(boardAfter).toEqual(boardBefore);
  });
});
