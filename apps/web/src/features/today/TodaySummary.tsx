import type {DemoScreenView} from '../demo/sectionView.js';
import {creditsText} from '../graduation/graduationView.js';
import {InAppLink} from '../../shell/AppShell.js';

/** "마감 임박" = a confirmed, still-open deadline within this many Seoul calendar days of asOf. */
export const DUE_SOON_DAYS = 7;

export interface SummaryCardView {
  readonly id: 'matched' | 'due' | 'credits';
  readonly label: string;
  /** Null when the section is not shared or not ready: the card shows `note` instead of a number. */
  readonly value: {readonly number: string; readonly unit: string} | null;
  readonly note: string;
  readonly to: string;
  readonly linkText: string;
  readonly urgent: boolean;
}

/**
 * #9 v5 home summary. Every number is counted from the screen's own snapshot view; nothing is
 * estimated, and a hidden or pending section shows its state in words, never 0.
 */
export function buildTodaySummary(view: DemoScreenView): readonly SummaryCardView[] {
  const feed = view.feed.kind === 'SHOW' ? view.feed.data : null;
  const cards = feed ? [...feed.featured, ...feed.compact] : [];
  const due = cards.filter(c => c.dday && c.dday.days <= DUE_SOON_DAYS).length;
  const stateNote = (s: {kind: 'HIDDEN'} | {kind: 'PLACEHOLDER'; text: string} | {kind: 'SHOW'}) =>
    s.kind === 'HIDDEN' ? '시연 공유 범위 밖' : s.kind === 'PLACEHOLDER' ? s.text : '';
  const a = view.academics;
  return [
    {id: 'matched', label: '맞춤 기회', to: '/opportunities', linkText: '맞춤 기회 보기',
      value: feed ? {number: String(feed.featured.length), unit: '건'} : null,
      note: feed ? `나에게 관련된 기회 ${feed.featured.length}개` : stateNote(view.feed), urgent: false},
    {id: 'due', label: `확정 ${DUE_SOON_DAYS}일 내 일정`, to: '/opportunities', linkText: '공고 보기',
      value: feed ? {number: String(due), unit: '건'} : null,
      note: feed ? `확정 마감 ${due}개` : stateNote(view.feed), urgent: due > 0},
    {id: 'credits', label: '취득 학점', to: '/graduation', linkText: '졸업지원 보기',
      value: a.kind === 'SHOW' ? {number: creditsText(a.data.earnedCreditUnits).replace('학점', ''), unit: '학점'} : null,
      note: a.kind === 'SHOW'
        ? `수강 중 ${creditsText(a.data.inProgressCreditUnits)} · 공식 판정 아님`
        : stateNote(a),
      urgent: false},
  ];
}

const ICON: Record<SummaryCardView['id'], string> = {
  matched: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1M13 11l7-7M17 4h3v3',
  due: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h3',
  credits: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
};

/** P001 summary: three horizontal cards; the whole card is one link. Numbers are the screen's own. */
export function TodaySummary({view, navigate}: {view: DemoScreenView; navigate: (p: string) => void}) {
  return (
    <section className="summary" aria-label="오늘의 요약">
      {buildTodaySummary(view).map(c => (
        <InAppLink key={c.id} to={c.to} navigate={navigate} className={`summary__card summary__card--${c.id}`}>
          <svg className="summary__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={ICON[c.id]} /></svg>
          <span className="summary__text">
            <span className="summary__label">{c.label}</span>
            {c.value
              ? <span className={`summary__value${c.urgent ? ' is-urgent' : ''}`}>{c.value.number}<small>{c.value.unit}</small></span>
              : <span className="summary__value summary__value--none">—<span className="visually-hidden"> 표시하지 않음</span></span>}
            <span className="summary__note">{c.note}</span>
          </span>
          <span className="summary__go" aria-hidden="true">›</span>
          <span className="visually-hidden"> — {c.linkText}</span>
        </InAppLink>
      ))}
    </section>
  );
}
