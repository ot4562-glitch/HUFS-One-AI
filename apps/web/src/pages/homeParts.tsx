import type {ReactNode} from 'react';
import type {DemoScreenView, FeedCardView} from '../features/demo/sectionView.js';
import type {NoticeItemView} from '../features/notices/noticeView.js';
import type {DDayView} from '../features/demo/dday.js';
import {DUE_SOON_DAYS} from '../features/today/TodaySummary.js';
import {InAppLink} from '../shell/AppShell.js';
import {DDayText} from '../features/demo/DDayText.js';
import {opportunityArtwork} from '../features/illustrations/artwork.js';
import {SyntheticArtwork} from '../features/illustrations/SyntheticArtwork.js';

/**
 * #9 v5 home modules and opportunity cards (v5 mock: same-width left chips, title, one sub line;
 * cards with a right status column). Text comes from the existing view models as-is: eligibility is
 * the server verdict, a relevance score is never shown without its disclaimer.
 */
type Nav = (path: string) => void;
type Tone = 'urgent' | 'soon' | 'ok' | 'info' | 'neutral';

const oppPath = (id: string) => `/opportunities/${encodeURIComponent(id)}`;
const ddayTone = (d: DDayView | null): Tone => !d ? 'neutral' : d.days <= 3 ? 'urgent' : d.days <= DUE_SOON_DAYS ? 'soon' : 'ok';

/** Fixed-width left chip; D-day keeps its spoken form for screen readers. */
export function Chip({tone, children}: {tone: Tone; children: ReactNode}) {
  return <span className={`mchip mchip--${tone}`}>{children}</span>;
}

export function Module({title, action, wide, children}: {title: string; action?: ReactNode; wide?: boolean; children: ReactNode}) {
  return (
    <section className={`module${wide ? ' module--wide' : ''}`} aria-label={title}>
      <div className="module__head"><h2>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export function HomeOppRow({card, navigate}: {card: FeedCardView; navigate: Nav}) {
  return (
    <li className="mrow">
      <Chip tone={ddayTone(card.dday)}>{card.dday ? <DDayText dday={card.dday} /> : card.lifecycleText}</Chip>
      <div className="mrow__body">
        <h3 className="mrow__title"><InAppLink to={oppPath(card.opportunityId)} navigate={navigate}>{card.title}</InAppLink></h3>
        <p className="mrow__sub">{[card.eligibilityText, ...card.topicTexts.slice(0, 2)].join(' · ')}</p>
        {card.relevance && (
          <p className="card__relevance mrow__rel">{card.relevance.text}<span className="card__disclaimer">{card.relevance.disclaimer}</span></p>
        )}
      </div>
    </li>
  );
}

export function HomeNoticeRow({item, navigate}: {item: NoticeItemView; navigate: Nav}) {
  return (
    <li className="mrow">
      <Chip tone={item.dday ? ddayTone(item.dday) : 'info'}>{item.dday ? <DDayText dday={item.dday} /> : item.pinned ? '고정' : '공지'}</Chip>
      <div className="mrow__body">
        <p className="mrow__title"><InAppLink to={item.path} navigate={navigate}>{item.title}</InAppLink></p>
        <p className="mrow__sub">{[item.priorityText, item.appliesText, item.deadlineText].filter(Boolean).join(' · ')}</p>
      </div>
    </li>
  );
}

/** Confirmed upcoming deadlines from the cards and notices already on screen, nearest first. */
export function upcomingDeadlines(cards: readonly FeedCardView[], notices: readonly NoticeItemView[], max = 4) {
  return [
    ...cards.flatMap(c => c.dday ? [{key: 'o' + c.opportunityId, kind: '공고', title: c.title, path: oppPath(c.opportunityId), dday: c.dday}] : []),
    ...notices.flatMap(n => n.dday ? [{key: 'n' + n.noticeId, kind: '공지', title: n.title, path: n.path, dday: n.dday}] : []),
  ].sort((a, b) => a.dday.days - b.dday.days).slice(0, max);
}

/**
 * #298: the one date the listed D-days count from. Omitted when the list is empty or when its
 * opportunity and notice items count from different dates, so a single line is never wrong.
 */
export function deadlineBasisText(items: ReturnType<typeof upcomingDeadlines>, basis: DemoScreenView['ddayBasis']): string | null {
  const texts = new Set(items.map(i => i.kind === '공고' ? basis.feed : basis.notices));
  const [only] = texts;
  return texts.size === 1 && only ? only : null;
}

export function DeadlineRow({item, navigate}: {item: ReturnType<typeof upcomingDeadlines>[number]; navigate: Nav}) {
  return (
    <li className="mrow">
      <Chip tone={ddayTone(item.dday)}><DDayText dday={item.dday} /></Chip>
      <div className="mrow__body">
        <p className="mrow__title"><InAppLink to={item.path} navigate={navigate}>{item.title}</InAppLink></p>
        <p className="mrow__sub">{item.kind}</p>
      </div>
    </li>
  );
}

const CAL_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

/** 기회 list card: content in the middle, status column on the right; one call to action. */
export function OppCard({card, navigate}: {card: FeedCardView; navigate: Nav}) {
  const art = opportunityArtwork(card);
  const mark = card.eligibility === 'ELIGIBLE' ? '✓' : card.eligibility === 'INELIGIBLE' ? '✕' : '?';
  const why = card.reasons[0];
  return (
    <li className="opp">
      <article className="opp__main">
        {art && <SyntheticArtwork key={art.id} art={art} className="opp__art" />}
        <h3 className="opp__title"><InAppLink to={oppPath(card.opportunityId)} navigate={navigate}>{card.title}</InAppLink></h3>
        {card.topicTexts.length > 0 && <ul className="opp__chips" aria-label="분야">{card.topicTexts.map(t => <li key={t}>{t}</li>)}</ul>}
        {why && <p className="opp__why"><strong>추천 이유</strong> {why}</p>}
        {card.relevance && (
          <p className="card__relevance opp__rel">{card.relevance.text}<span className="card__disclaimer">{card.relevance.disclaimer}</span></p>
        )}
        {(card.deadlineText || card.badges.length > 0) && (
          <p className="opp__meta">{CAL_ICON}{[card.deadlineText, ...card.badges].filter(Boolean).join(' · ')}</p>
        )}
      </article>
      <div className="opp__side">
        <Chip tone={ddayTone(card.dday)}>{card.lifecycleText}{card.dday && <> · <DDayText dday={card.dday} /></>}</Chip>
        <p className={`opp__elig opp__elig--${card.eligibility.toLowerCase()}`}><span aria-hidden="true">{mark}</span> {card.eligibilityText}</p>
        <InAppLink to={oppPath(card.opportunityId)} navigate={navigate} className="button opp__cta">
          자세히 보기<span className="visually-hidden"> ({card.title})</span>
        </InAppLink>
      </div>
    </li>
  );
}
