import {useState} from 'react';
import type {DemoScreenView} from '../features/demo/sectionView.js';
import {buildTodaySummary, type SummaryCardView} from '../features/today/TodaySummary.js';
import {InAppLink} from '../shell/AppShell.js';

type Step = SummaryCardView['id'];

/**
 * A keyboard-operable next-step selector, derived only from the already authorized
 * current screen projection. It never creates a new prediction or fetches private data.
 */
export function HomeJourney({view, navigate}: {view: DemoScreenView; navigate: (path: string) => void}) {
  const [active, setActive] = useState<Step>('matched');
  const cards = buildTodaySummary(view);
  const selected = cards.find(card => card.id === active) ?? cards[0]!;
  const index = cards.findIndex(card => card.id === selected.id) + 1;

  return (
    <section className="journey" aria-label="오늘의 액션 가이드">
      <div className="journey__intro">
        <span className="journey__eyebrow">ONE AI · NEXT STEP</span>
        <h2>오늘, 무엇부터 시작할까요?</h2>
        <p>궁금한 항목을 선택하면 지금 화면에서 확인할 수 있는 정보와 다음 행동을 보여드려요.</p>
      </div>
      <div className="journey__layout">
        <div className="journey__choices" role="group" aria-label="오늘의 활동 선택">
          {cards.map((card, i) => (
            <button
              key={card.id}
              type="button"
              className={'journey__choice' + (selected.id === card.id ? ' is-active' : '')}
              aria-pressed={selected.id === card.id}
              onClick={() => setActive(card.id)}
            >
              <span className="journey__step" aria-hidden="true">0{i + 1}</span>
              <span className="journey__choice-text">
                <strong>{card.label}</strong>
                <small>{card.value ? card.value.number + card.value.unit + ' 확인' : '공유 상태 확인'}</small>
              </span>
              <span className="journey__arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
        <div key={selected.id} className={'journey__panel journey__panel--' + selected.id} role="region" aria-label={selected.label + ' 안내'} aria-live="polite">
          <div className="journey__panel-top">
            <span>MY FOCUS</span>
            <span className="journey__count">0{index} / 03</span>
          </div>
          <p className="journey__panel-label">{selected.label}</p>
          <p className="journey__value">
            {selected.value ? <>{selected.value.number}<small>{selected.value.unit}</small></> : <span aria-label="공개되지 않음">—</span>}
          </p>
          <p className="journey__note">{selected.note}</p>
          <InAppLink to={selected.to} navigate={navigate} className="journey__cta">
            {selected.linkText}<span aria-hidden="true"> ↗</span>
          </InAppLink>
          <p className="journey__footnote">현재 화면에 허용된 자료 기준 · 공식 판정 아님</p>
        </div>
      </div>
    </section>
  );
}
