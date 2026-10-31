import type {AcademicSummary, DemoProfileOption, DemoSnapshot, FeedResult, ForecastSummary} from '@hufs-one/contracts';

type SharedSection = DemoProfileOption['allowedSections'][number];
type FeedCard = FeedResult['featured'][number];
type PendingSection = {readonly state: 'NOT_SHARED' | 'PENDING'};

/** HIDDEN renders nothing (not even a heading); PLACEHOLDER renders an explanatory empty state. */
export type SectionView<T> =
  | {readonly kind: 'HIDDEN'}
  | {readonly kind: 'PLACEHOLDER'; readonly text: string}
  | {readonly kind: 'SHOW'; readonly data: T};

export interface FeedCardView {
  readonly opportunityId: string;
  readonly title: string;
  /** Server verdict shown verbatim; the client never recomputes eligibility. */
  readonly eligibilityText: string;
  readonly lifecycleText: string;
  readonly badges: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export interface FeedView {
  readonly featured: readonly FeedCardView[];
  readonly compact: readonly FeedCardView[];
  readonly hasMore: boolean;
}

export interface DemoScreenView {
  readonly snapshotBadges: readonly string[];
  readonly feed: SectionView<FeedView>;
  readonly notices: SectionView<DemoSnapshot['notices']>;
  readonly academics: SectionView<AcademicSummary>;
  readonly forecast: SectionView<ForecastSummary>;
}

const ELIGIBILITY_TEXT: Record<FeedCard['eligibility'], string> = {
  ELIGIBLE: '지원 조건 충족',
  INELIGIBLE: '지원 조건 미충족',
  UNKNOWN: '자격 확인 필요',
};

const LIFECYCLE_TEXT: Record<FeedCard['lifecycle'], string> = {
  UPCOMING: '모집 예정',
  OPEN: '모집 중',
  CLOSED: '마감',
  UNKNOWN: '일정 확인 필요',
};

const PROVENANCE_BADGE: Record<DemoSnapshot['aiProvenance'], string | null> = {
  LIVE_NCP: 'AI 실시간 응답',
  VALIDATED_CACHE: 'AI 검증 캐시',
  MOCK: 'AI 예시(모의)',
  NONE: null,
};

const PENDING_TEXT = {NOT_SHARED: '공유되지 않은 정보입니다.', PENDING: '아직 준비 중인 정보입니다.'} as const;

function cardView(card: FeedCard): FeedCardView {
  return {
    opportunityId: card.opportunityId,
    title: card.title,
    eligibilityText: ELIGIBILITY_TEXT[card.eligibility],
    lifecycleText: LIFECYCLE_TEXT[card.lifecycle],
    badges: card.dataMode === 'SYNTHETIC' ? ['합성 공고'] : [],
    evidenceRefs: card.evidenceRefs,
  };
}

function isPending(section: object): section is PendingSection {
  return 'state' in section && (section.state === 'NOT_SHARED' || section.state === 'PENDING');
}

function gated<T extends object>(allowed: boolean, section: T | PendingSection): SectionView<T> {
  if (!allowed) return {kind: 'HIDDEN'};
  if (isPending(section)) return {kind: 'PLACEHOLDER', text: PENDING_TEXT[section.state]};
  return {kind: 'SHOW', data: section};
}

/**
 * Maps a current snapshot to what may be rendered. Sections outside the profile's
 * allowedSections are HIDDEN even if the payload carries data for them.
 */
export function buildDemoScreenView(snapshot: DemoSnapshot, allowedSections: readonly SharedSection[]): DemoScreenView {
  const allow = new Set(allowedSections);
  const snapshotBadges = [
    ...(snapshot.datasetMode === 'SYNTHETIC' ? ['합성 자료'] : snapshot.datasetMode === 'MIXED' ? ['실제+합성 혼합'] : []),
    ...(PROVENANCE_BADGE[snapshot.aiProvenance] ? [PROVENANCE_BADGE[snapshot.aiProvenance] as string] : []),
  ];
  return {
    snapshotBadges,
    feed: allow.has('FEED')
      ? {kind: 'SHOW', data: {featured: snapshot.feed.featured.map(cardView), compact: snapshot.feed.compact.map(cardView), hasMore: snapshot.feed.hasMore}}
      : {kind: 'HIDDEN'},
    notices: allow.has('NOTICES') ? {kind: 'SHOW', data: snapshot.notices} : {kind: 'HIDDEN'},
    academics: gated<AcademicSummary>(allow.has('ACADEMICS'), snapshot.academics),
    forecast: gated<ForecastSummary>(allow.has('FORECAST'), snapshot.forecast),
  };
}
