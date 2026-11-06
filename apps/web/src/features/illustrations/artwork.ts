import type {FeedCardView} from '../demo/sectionView.js';
import type {ClubCardView} from '../clubs/clubView.js';

export type ArtworkId = 'technology' | 'media' | 'language' | 'international' | 'policy' | 'volunteer' | 'music' | 'career';
export interface Artwork {
  readonly id: ArtworkId;
  readonly small: string;
  readonly large: string;
  readonly alt: string;
}

const urls = {
  technology: [new URL('./assets/technology-480.webp', import.meta.url).href, new URL('./assets/technology-960.webp', import.meta.url).href],
  media: [new URL('./assets/media-480.webp', import.meta.url).href, new URL('./assets/media-960.webp', import.meta.url).href],
  language: [new URL('./assets/language-480.webp', import.meta.url).href, new URL('./assets/language-960.webp', import.meta.url).href],
  international: [new URL('./assets/international-480.webp', import.meta.url).href, new URL('./assets/international-960.webp', import.meta.url).href],
  policy: [new URL('./assets/policy-480.webp', import.meta.url).href, new URL('./assets/policy-960.webp', import.meta.url).href],
  volunteer: [new URL('./assets/volunteer-480.webp', import.meta.url).href, new URL('./assets/volunteer-960.webp', import.meta.url).href],
  music: [new URL('./assets/music-480.webp', import.meta.url).href, new URL('./assets/music-960.webp', import.meta.url).href],
  career: [new URL('./assets/career-480.webp', import.meta.url).href, new URL('./assets/career-960.webp', import.meta.url).href],
} as const;
const alternatives: Record<ArtworkId, string> = {
  technology: '가상의 학생들이 노트북과 작은 로봇으로 아이디어를 나누는 합성 그림',
  media: '영화 카메라와 필름, 빈 슬레이트를 배치한 합성 영상 창작 그림',
  language: '빈 책과 종이 말풍선, 만년필을 배치한 합성 번역·언어 그림',
  international: '작은 지구본과 종이비행기로 표현한 합성 국제교류 그림',
  policy: '종이 도시와 원탁, 도형으로 표현한 합성 정책 토론 그림',
  volunteer: '물뿌리개와 장갑, 어린 식물을 그린 합성 환경 봉사 그림',
  music: '악기와 조명이 있는 빈 무대를 그린 합성 공연 그림',
  career: '포트폴리오와 프로젝트 모형을 놓은 합성 진로 준비 그림',
};
export const ARTWORK: Readonly<Record<ArtworkId, Artwork>> = Object.fromEntries(
  (Object.keys(urls) as ArtworkId[]).map(id => [id, {id, small: urls[id][0], large: urls[id][1], alt: alternatives[id]}]),
) as Record<ArtworkId, Artwork>;

/** Exact synthetic poster identities only. New server assets never inherit this approval. */
const CLUB_ART: Readonly<Record<string, ArtworkId>> = {
  '001': 'language', '002': 'language', '003': 'policy', '004': 'international',
  '005': 'technology', '006': 'technology', '007': 'policy', '008': 'policy',
  '009': 'media', '010': 'volunteer', '012': 'music',
};
export function clubArtwork(club: Pick<ClubCardView, 'id' | 'posterSeed'>): Artwork | undefined {
  const suffix = /^SYN-CLUB-(\d{3})$/.exec(club.id)?.[1];
  const key = suffix && club.posterSeed === `SYN-POSTER-CLUB-${suffix}` ? CLUB_ART[suffix] : undefined;
  return key ? ARTWORK[key] : undefined;
}

// Art describes already-visible synthetic cards; it never adds a card or changes eligibility/order.
const OPPORTUNITY_ART: readonly ArtworkId[] = [
  'international', 'technology', 'technology', 'media', 'international', 'language',
  'career', 'technology', 'career', 'policy', 'language', 'technology', 'career', 'policy',
  'international', 'technology', 'media', 'volunteer', 'career', 'international',
  'technology', 'media', 'career', 'policy', 'technology', 'language', 'policy',
  'career', 'technology', 'international', 'career', 'volunteer', 'career', 'language',
  'international', 'technology', 'international', 'technology', 'career', 'volunteer',
];
export function opportunityArtwork(card: Pick<FeedCardView, 'opportunityId' | 'badges'>): Artwork | undefined {
  if (!card.badges.includes('합성 공고')) return undefined;
  const id = /^SYN-OPP-(\d{3})$/.exec(card.opportunityId)?.[1];
  const key = id ? OPPORTUNITY_ART[Number(id) - 1] : undefined;
  return key ? ARTWORK[key] : undefined;
}
