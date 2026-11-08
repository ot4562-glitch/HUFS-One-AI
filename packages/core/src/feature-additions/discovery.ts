/**
 * Permission-scoped discovery and interpretation: #348, #351, #352.
 * The caller MUST supply an already-authorized catalog and bind an opaque,
 * signed HTTP cursor to the actor/scope; this module makes no network calls.
 */
import type {SourceState} from './eligibility.js';

export type ApprovedOpportunity = {
  id: string;
  title: string;
  category: string;
  campus?: string;
  topicCodes: readonly string[];
  sourceState: SourceState;
  permitted: boolean;
  deadline?: string;
  publishedAt?: string;
};
export type OpportunityFilters = {
  q?: string;
  category?: string;
  campus?: string;
  order: 'TITLE' | 'DEADLINE_ASC' | 'PUBLISHED_DESC';
};
export type SearchCursor = {
  sourceRevisionId: string;
  scopeToken: string;
  filterKey: string;
  lastId: string;
};
export type OpportunitySearchPage = {
  items: readonly ApprovedOpportunity[];
  nextCursor: SearchCursor | null;
  hasMore: boolean;
  scope: 'AUTHORIZED_CATALOG';
};
const caseFold = (s: string): string => s.normalize('NFKC').toLocaleLowerCase('ko').trim();
const sortTime = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : fallback;
};
export function opportunityFilterKey(filters: OpportunityFilters, asOf: string): string {
  return JSON.stringify([caseFold(filters.q ?? ''), filters.category ?? '', filters.campus ?? '',
    filters.order, asOf]);
}
export function searchApprovedOpportunities(
  catalog: readonly ApprovedOpportunity[],
  filters: OpportunityFilters,
  options: {asOf: string; sourceRevisionId: string; scopeToken: string; limit: number; cursor?: SearchCursor},
): OpportunitySearchPage {
  const at = Date.parse(options.asOf);
  if (!Number.isFinite(at)) throw new RangeError('invalid asOf');
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 50) {
    throw new RangeError('limit out of bounds');
  }
  const key = opportunityFilterKey(filters, options.asOf);
  if (options.cursor && (options.cursor.sourceRevisionId !== options.sourceRevisionId
    || options.cursor.scopeToken !== options.scopeToken || options.cursor.filterKey !== key)) {
    throw new RangeError('STALE_CURSOR');
  }
  const q = caseFold(filters.q ?? '');
  const filtered = catalog.filter(o => o.permitted && o.sourceState === 'VERIFIED'
    && (!filters.category || o.category === filters.category)
    && (!filters.campus || o.campus === filters.campus)
    && (!q || caseFold([o.title, ...o.topicCodes].join(' ')).includes(q))
    && (!o.publishedAt || sortTime(o.publishedAt, Infinity) <= at));
  filtered.sort((a, b) => {
    if (filters.order === 'DEADLINE_ASC') {
      const diff = sortTime(a.deadline, Infinity) - sortTime(b.deadline, Infinity);
      if (Number.isFinite(diff) && diff !== 0) return diff;
      if (Number.isFinite(sortTime(a.deadline, Infinity)) !== Number.isFinite(sortTime(b.deadline, Infinity))) {
        return Number.isFinite(sortTime(a.deadline, Infinity)) ? -1 : 1;
      }
    }
    if (filters.order === 'PUBLISHED_DESC') {
      const diff = sortTime(b.publishedAt, -Infinity) - sortTime(a.publishedAt, -Infinity);
      if (Number.isFinite(diff) && diff !== 0) return diff;
      const aKnown = Number.isFinite(sortTime(a.publishedAt, -Infinity));
      const bKnown = Number.isFinite(sortTime(b.publishedAt, -Infinity));
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
    }
    return (filters.order === 'TITLE' ? a.title.localeCompare(b.title, 'ko') : 0)
      || a.id.localeCompare(b.id, 'en');
  });
  let start = 0;
  if (options.cursor) {
    start = filtered.findIndex(o => o.id === options.cursor!.lastId);
    if (start < 0) throw new RangeError('STALE_CURSOR');
    start += 1;
  }
  const items = filtered.slice(start, start + options.limit);
  const hasMore = start + items.length < filtered.length;
  const last = items.at(-1);
  return {items, hasMore, nextCursor: hasMore && last
    ? {lastId: last.id, sourceRevisionId: options.sourceRevisionId,
      scopeToken: options.scopeToken, filterKey: key} : null, scope: 'AUTHORIZED_CATALOG'};
}

export type EmploymentCount = {
  numerator?: number;
  denominator?: number;
  sourceState: SourceState;
  publicApproved: boolean;
  /** Must come from the source's verified publication policy. */
  minPublishablePositiveCount?: number;
};
export type EmploymentRate = {
  status: 'PERCENT' | 'OBSERVED_ZERO' | 'NO_DATA' | 'SUPPRESSED' | 'INVALID_DENOMINATOR';
  percentage?: number;
};
/** No source-defined publication policy -> no public microdata-derived percentage. */
export function calculatePublicEmploymentRate(data: EmploymentCount): EmploymentRate {
  if (data.sourceState !== 'VERIFIED' || !data.publicApproved
    || data.minPublishablePositiveCount === undefined
    || !Number.isSafeInteger(data.minPublishablePositiveCount)
    || data.minPublishablePositiveCount < 1) return {status: 'SUPPRESSED'};
  if (data.numerator === undefined || data.denominator === undefined) return {status: 'NO_DATA'};
  if (!Number.isSafeInteger(data.numerator) || data.numerator < 0
    || !Number.isSafeInteger(data.denominator) || data.denominator <= 0
    || data.numerator > data.denominator) return {status: 'INVALID_DENOMINATOR'};
  // Zero may only be published when the governing policy explicitly permits it.
  if (data.numerator === 0) return {status: 'OBSERVED_ZERO', percentage: 0};
  if (data.numerator < data.minPublishablePositiveCount
    || data.denominator - data.numerator < data.minPublishablePositiveCount) return {status: 'SUPPRESSED'};
  return {status: 'PERCENT', percentage: 100 * data.numerator / data.denominator};
}

export type Translation = {
  text: string;
  reviewStatus: 'HUMAN_VERIFIED' | 'MACHINE_DRAFT' | 'MISSING';
};
export type InternationalGuide = {
  id: string;
  topicCode: string;
  campuses: readonly string[];
  terms: readonly string[];
  sourceState: SourceState;
  translations: Partial<Record<'ko' | 'en' | 'zh', Translation>>;
};
export type GuideSelection = {
  id: string;
  state: 'READY' | 'SOURCE_UNKNOWN' | 'NOT_APPLICABLE';
  locale: 'ko' | 'en' | 'zh';
  text?: string;
  translationStatus: 'VERIFIED' | 'FALLBACK_KO' | 'UNAVAILABLE';
};
/** No machine-generated translation is ever presented as institution-verified. */
export function selectInternationalGuide(
  guide: InternationalGuide,
  request: {topicCode: string; campus?: string; term?: string; locale: 'ko' | 'en' | 'zh'},
): GuideSelection {
  const base = {id: guide.id};
  if (guide.topicCode !== request.topicCode
    || (request.campus && guide.campuses.length && !guide.campuses.includes(request.campus))
    || (request.term && guide.terms.length && !guide.terms.includes(request.term))) {
    return {...base, state: 'NOT_APPLICABLE', locale: request.locale, translationStatus: 'UNAVAILABLE'};
  }
  if (guide.sourceState !== 'VERIFIED' || (!request.campus && guide.campuses.length > 0)
    || (!request.term && guide.terms.length > 0)) {
    return {...base, state: 'SOURCE_UNKNOWN', locale: request.locale, translationStatus: 'UNAVAILABLE'};
  }
  const requested = guide.translations[request.locale];
  if (requested?.reviewStatus === 'HUMAN_VERIFIED' && requested.text.trim()) {
    return {...base, state: 'READY', locale: request.locale, text: requested.text,
      translationStatus: 'VERIFIED'};
  }
  const korean = guide.translations.ko;
  if (korean?.reviewStatus === 'HUMAN_VERIFIED' && korean.text.trim()) {
    return {...base, state: 'READY', locale: 'ko', text: korean.text, translationStatus: 'FALLBACK_KO'};
  }
  return {...base, state: 'SOURCE_UNKNOWN', locale: request.locale, translationStatus: 'UNAVAILABLE'};
}
