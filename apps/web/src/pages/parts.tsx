import type {ReactNode} from 'react';
import type {DemoViewState} from '../app/index.js';
import {buildDemoScreenView, type DemoScreenView, type FeedCardView} from '../features/demo/sectionView.js';
import type {NoticeItemView} from '../features/notices/noticeView.js';
import {InAppLink} from '../shell/AppShell.js';
import {DDayText} from '../features/demo/DDayText.js';

export const NOT_SHARED_TEXT = '이 항목은 시연 공유 범위 밖입니다.';

/** Screen view for the READY snapshot, gated by the selected profile's allowedSections. */
export function screenViewOf(state: DemoViewState): DemoScreenView | null {
  if (state.status !== 'READY' || !state.snapshot) return null;
  const profile = state.profiles.find(p => p.demoSubjectId === state.selected);
  return buildDemoScreenView(state.snapshot, profile?.allowedSections ?? []);
}

/** Body when there is no current snapshot; the header banner already explains errors. */
export function NoSnapshot({state}: {state: DemoViewState}) {
  if (state.status === 'IDLE') return <p className="muted">위에서 시연 대상을 고르면 그 학생에게 맞춘 화면이 보여요.</p>;
  if (state.status === 'LOADING') return <div className="skeleton" aria-hidden="true"><div /><div /><div /></div>;
  return <p className="muted">표시할 정보가 없습니다.</p>;
}

export function Badges({items, label = '공고 표시'}: {items: readonly string[]; label?: string}) {
  if (!items.length) return null;
  return <ul className="badges" aria-label={label}>{items.map(b => <li key={b} className="badge">{b}</li>)}</ul>;
}

export function Section({title, children, action}: {title: string; children: ReactNode; action?: ReactNode}) {
  return (
    <section className="section" aria-label={title}>
      <div className="section__head"><h2>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

type Nav = (path: string) => void;

export function FeaturedCard({card, navigate}: {card: FeedCardView; navigate: Nav}) {
  return (
    <article className="card card--large">
      <h3 className="card__title">
        <InAppLink to={`/opportunities/${encodeURIComponent(card.opportunityId)}`} navigate={navigate}>{card.title}</InAppLink>
      </h3>
      <p className="card__meta">
        <span className="status-text">{card.lifecycleText}{card.dday && <> · <DDayText dday={card.dday} /></>}</span>
        <span className="status-text">{card.eligibilityText}</span>
      </p>
      {card.topicTexts.length > 0 && <p className="card__topics">{card.topicTexts.join(' · ')}</p>}
      {card.relevance && (
        <p className="card__relevance">{card.relevance.text}<span className="card__disclaimer">{card.relevance.disclaimer}</span></p>
      )}
      {card.reasons.length > 0 && <ul className="card__reasons">{card.reasons.slice(0, 3).map(r => <li key={r}>{r}</li>)}</ul>}
      <Badges items={card.badges} />
    </article>
  );
}

export function CompactRow({card, navigate}: {card: FeedCardView; navigate: Nav}) {
  return (
    <li className="row">
      <InAppLink to={`/opportunities/${encodeURIComponent(card.opportunityId)}`} navigate={navigate} className="row__link">
        <span className="row__title">{card.title}</span>
        <span className="row__meta">{card.lifecycleText}{card.dday && <> · <DDayText dday={card.dday} /></>} · {card.eligibilityText}{card.badges.length ? ` · ${card.badges.join(' · ')}` : ''}</span>
      </InAppLink>
    </li>
  );
}

export function NoticeRow({item, navigate}: {item: NoticeItemView; navigate: Nav}) {
  return (
    <li className="row">
      <InAppLink to={item.path} navigate={navigate} className="row__link">
        <span className="row__title">{item.pinned && <span className="badge">고정</span>} {item.title}</span>
        <span className="row__meta">
          {[item.priorityText, item.appliesText, item.deadlineText].filter(Boolean).join(' · ')}
          {item.dday && <> · <DDayText dday={item.dday} /></>}
          {[item.overdueText, item.verificationText].filter(Boolean).map(t => ` · ${t}`).join('')}
        </span>
      </InAppLink>
    </li>
  );
}
