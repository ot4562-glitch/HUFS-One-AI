import {useId, useState} from 'react';
import type {FeedCardView} from '../features/demo/sectionView.js';
import {DUE_SOON_DAYS} from '../features/today/TodaySummary.js';
import {OppCard} from './homeParts.js';

type Filter = 'all' | 'soon' | 'eligible' | 'review';
type Order = 'recommended' | 'deadline';

const FILTERS: readonly {id: Filter; label: string}[] = [
  {id: 'all', label: '전체'},
  {id: 'soon', label: '7일 내 마감'},
  {id: 'eligible', label: '조건 충족'},
  {id: 'review', label: '자격 확인 필요'},
];

function daysUntilDeadline(card: FeedCardView): number {
  return card.dday && card.dday.days >= 0 ? card.dday.days : Number.POSITIVE_INFINITY;
}

function matches(card: FeedCardView, filter: Filter, query: string): boolean {
  if (filter === 'soon' && daysUntilDeadline(card) > DUE_SOON_DAYS) return false;
  if (filter === 'eligible' && card.eligibility !== 'ELIGIBLE') return false;
  if (filter === 'review' && card.eligibility !== 'UNKNOWN') return false;
  if (!query) return true;
  return [card.title, card.eligibilityText, ...card.topicTexts, ...card.reasons]
    .some(text => text.toLocaleLowerCase().includes(query));
}

/** Local-only exploration over the current, permission-gated feed. No invented search results. */
export function OpportunityExplorer({cards, navigate, hasMore}: {
  cards: readonly FeedCardView[];
  navigate: (path: string) => void;
  hasMore: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [order, setOrder] = useState<Order>('recommended');
  const searchId = useId();
  const sortId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const shown = cards.filter(card => matches(card, filter, normalizedQuery));
  const filterCounts = Object.fromEntries(FILTERS.map(item => [
    item.id, cards.filter(card => matches(card, item.id, '')).length,
  ])) as Record<Filter, number>;
  const isFiltered = query.trim().length > 0 || filter !== 'all' || order !== 'recommended';
  if (order === 'deadline') shown.sort((a, b) => daysUntilDeadline(a) - daysUntilDeadline(b));

  function clear() {
    setQuery('');
    setFilter('all');
    setOrder('recommended');
  }

  return (
    <section className="explorer" aria-label="공고 탐색">
      <div className="explorer__intro">
        <div><span className="explorer__kicker">조건으로 찾기</span><h3>나에게 필요한 공고</h3></div>
        <span className="explorer__scope-label">현재 공유된 공고만 검색</span>
      </div>
      <div className="explorer__tools">
        <div className="explorer__search">
          <label htmlFor={searchId}>공고 검색</label>
          <input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="제목·관심 분야·추천 이유 검색" autoComplete="off" />
        </div>
        <div className="explorer__sort">
          <label htmlFor={sortId}>정렬</label>
          <select id={sortId} value={order} onChange={event => setOrder(event.target.value as Order)}>
            <option value="recommended">기본 추천 순서</option>
            <option value="deadline">확정 마감 가까운 순</option>
          </select>
        </div>
        <fieldset className="explorer__filters">
          <legend>빠른 필터</legend>
          <div className="explorer__filter-row">
            {FILTERS.map(item => (
              <button key={item.id} type="button" aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)} className="explorer__filter">
                {item.label}<span className="explorer__filter-count" aria-hidden="true">{filterCounts[item.id]}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="explorer__result-bar">
        <p className="explorer__result" role="status" aria-live="polite" aria-atomic="true">
          현재 목록 {cards.length}건 중 <strong>{shown.length}건</strong> 표시
        </p>
        {isFiltered && shown.length > 0 && <button type="button" className="explorer__reset" onClick={clear}>검색 조건 초기화</button>}
      </div>
      {shown.length
        ? <ul className="opps">{shown.map(card => <OppCard key={card.opportunityId} card={card} navigate={navigate} />)}</ul>
        : <div className="explorer__empty">
            <p>선택한 검색어와 조건에 맞는 공고가 없어요.</p>
            <button type="button" className="button" onClick={clear}>검색 조건 초기화</button>
          </div>}
      {hasMore && <p className="muted explorer__scope">현재 화면에 표시된 공고만 검색합니다. 전체 공고 검색은 아직 지원하지 않습니다.</p>}
    </section>
  );
}
