import {useState} from 'react';
import type {FeedCardView} from '../features/demo/sectionView.js';
import type {NoticeItemView} from '../features/notices/noticeView.js';
import {InAppLink} from '../shell/AppShell.js';
import {DeadlineRow, OppCard, upcomingDeadlines} from './homeParts.js';

type Filter = 'ALL' | 'MATCHED' | 'CHECK' | 'INELIGIBLE';

/**
 * 맞춤 기회 (#9 redesign, Essential mockup "AI 맞춤 기회"): filter pills over the cards already on screen,
 * a card list, and a right column with counts and upcoming confirmed deadlines. Filtering only narrows
 * what the server sent; it never re-scores or re-decides eligibility.
 */
export function OppFeed({featured, compact, ineligible, notices, navigate}: {
  featured: readonly FeedCardView[]; compact: readonly FeedCardView[]; ineligible: readonly FeedCardView[];
  notices: readonly NoticeItemView[]; navigate: (p: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const listed = [...featured, ...compact];
  const matched = new Set(featured.map(c => c.opportunityId));
  const check = listed.filter(c => c.eligibility === 'UNKNOWN');
  const pills: readonly {id: Filter; label: string; cards: readonly FeedCardView[]}[] = [
    {id: 'ALL', label: '전체', cards: listed},
    {id: 'MATCHED', label: '맞춤 추천', cards: featured},
    {id: 'CHECK', label: '자격 확인 필요', cards: check},
    {id: 'INELIGIBLE', label: '조건 미충족', cards: ineligible},
  ];
  const shown = pills.find(p => p.id === filter)!.cards;
  const deadlines = upcomingDeadlines(listed, notices, 5);
  return (
    <div className="feed">
      <div className="feed__main">
        <div className="feed__head">
          <h2 className="feed__title">나를 위한 추천 피드</h2>
          <p className="muted feed__lead">시연 대상의 전공·학년·관심 분야와 공고 원문 근거로 고른 공고예요. 신청 직전에는 공식 공고에서 자격과 마감을 다시 확인해 주세요.</p>
        </div>
        <div className="pills" role="group" aria-label="공고 보기">
          {pills.map(p => (
            <button key={p.id} type="button" className="pill" aria-pressed={filter === p.id} onClick={() => setFilter(p.id)}>
              {p.label} ({p.cards.length})
            </button>
          ))}
        </div>
        {shown.length
          ? <ul className="opps" aria-label={`${pills.find(p => p.id === filter)!.label} 공고`}>
            {shown.map(c => <OppCard key={c.opportunityId} card={c} navigate={navigate} matched={matched.has(c.opportunityId)} />)}
          </ul>
          : <p className="muted">이 조건에 맞는 공고가 없어요.</p>}
      </div>
      <aside className="feed__side" aria-label="추천 요약">
        <section className="side-card" aria-label="맞춤 요약">
          <h2>맞춤 요약</h2>
          <ul className="side-card__stats">
            <li><span>맞춤 추천</span><strong>{featured.length}건</strong></li>
            <li><span>확정 7일 내 마감</span><strong>{listed.filter(c => c.dday && c.dday.days <= 7).length}건</strong></li>
            <li><span>자격 확인 필요</span><strong>{check.length}건</strong></li>
          </ul>
          <p className="muted side-card__note">추천 이유는 규칙과 원문 근거로 만든 설명이며, 합격이나 취업 가능성이 아니에요.</p>
        </section>
        <section className="side-card" aria-label="추천 설정">
          <h2>추천 설정</h2>
          <p className="muted">관심 분야를 바꾸면 같은 기준 시각으로 추천이 어떻게 달라지는지 비교할 수 있어요.</p>
          <InAppLink to="/settings" navigate={navigate} className="side-card__link">설정 변경 ›</InAppLink>
        </section>
        <section className="side-card" aria-label="관심 공고·일정">
          <h2>다가오는 확정 마감</h2>
          {deadlines.length ? <ul className="mlist">{deadlines.map(d => <DeadlineRow key={d.key} item={d} navigate={navigate} />)}</ul>
            : <p className="muted">확정된 마감이 없어요.</p>}
        </section>
      </aside>
    </div>
  );
}
