import type {DemoContext, DemoOverlayPut, DemoOverlayResult, DemoSnapshot, FeedResult} from '@hufs-one/contracts';

/** #85 temporary BETA choices (server overlay API). Writes are CAS on overlay.version. */
export interface OverlayPort {
  get(context: DemoContext, signal: AbortSignal): Promise<DemoOverlayResult>;
  set(context: DemoContext, change: DemoOverlayPut, signal: AbortSignal): Promise<DemoOverlayResult>;
  reset(context: DemoContext, expectedVersion: number, signal: AbortSignal): Promise<DemoOverlayResult>;
}

type Card = FeedResult['featured'][number];

export interface DiffCard {
  readonly id: string;
  readonly title: string;
  /** "자격 확인 필요" is kept visible when the server said UNKNOWN. */
  readonly needsCheck: boolean;
  /** Server-written reasons for a card that newly became large (never invented here). */
  readonly reasons: readonly string[];
}

export interface FeedDiff {
  readonly asOf: string;
  readonly overlayBefore: string;
  readonly overlayAfter: string;
  readonly added: readonly DiffCard[];
  /** Left the large cards; `whereText` says where it is now. No reason is claimed. */
  readonly removed: readonly (DiffCard & {readonly whereText: string})[];
  readonly kept: readonly DiffCard[];
  readonly compactBefore: number;
  readonly compactAfter: number;
}

const card = (c: Card): DiffCard => ({
  id: c.opportunityId, title: c.title, needsCheck: c.eligibility === 'UNKNOWN',
  reasons: c.explanation ? c.explanation.reasons.map(r => r.text) : [],
});

/**
 * Before/after of the same student's feed at the same asOf. Returns null when the two snapshots are not
 * comparable (different subject, context or asOf) — never a mixed comparison.
 */
export function compareFeeds(before: DemoSnapshot, after: DemoSnapshot): FeedDiff | null {
  if (before.contextId !== after.contextId || before.demoSubjectId !== after.demoSubjectId
    || Date.parse(before.asOf) !== Date.parse(after.asOf)) return null;
  const bf = new Set(before.feed.featured.map(c => c.opportunityId));
  const af = new Set(after.feed.featured.map(c => c.opportunityId));
  const ac = new Set(after.feed.compact.map(c => c.opportunityId));
  return {
    asOf: after.asOf,
    overlayBefore: before.versions.overlay,
    overlayAfter: after.versions.overlay,
    added: after.feed.featured.filter(c => !bf.has(c.opportunityId)).map(card),
    removed: before.feed.featured.filter(c => !af.has(c.opportunityId)).map(c => ({
      ...card(c), reasons: [],
      whereText: ac.has(c.opportunityId) ? '작은 목록으로 이동' : '큰 카드·작은 목록에서 빠짐(전체 공고에서 볼 수 있어요)',
    })),
    kept: after.feed.featured.filter(c => bf.has(c.opportunityId)).map(card),
    compactBefore: before.feed.compact.length,
    compactAfter: after.feed.compact.length,
  };
}
