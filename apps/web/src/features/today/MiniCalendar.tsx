import {useEffect, useState} from 'react';
import type {DemoController, DemoViewState} from '../../app/index.js';
import type {AppServices} from '../../App.js';
import {InAppLink} from '../../shell/AppShell.js';
import {buildCalendarView, MARKERS, type CalendarItemView, type CalendarScreenView, type MarkerCategory} from './calendarView.js';

interface Props {
  readonly state: DemoViewState;
  readonly controller: DemoController;
  readonly loadCalendar: AppServices['loadCalendar'];
  readonly navigate: (path: string) => void;
}

type Load =
  | {readonly key: string; readonly status: 'LOADING'}
  | {readonly key: string; readonly status: 'READY'; readonly view: CalendarScreenView}
  | {readonly key: string; readonly status: 'ERROR'};

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

function Marker({category}: {category: MarkerCategory}) {
  // Shape differs per category; the text label is always rendered next to it in lists.
  return <span className={`marker marker--${category.toLowerCase()}`} aria-hidden="true" />;
}

function ItemList({items, navigate}: {items: readonly CalendarItemView[]; navigate: (p: string) => void}) {
  return (
    <ul className="cal__items">
      {items.map(i => (
        <li key={i.id}>
          <InAppLink to={i.link.path} navigate={navigate} className="cal__item">
            <span className="cal__item-head"><Marker category={i.category} /> {MARKERS[i.category].text}{i.category === 'MY_DEADLINE' ? ` · ${i.importanceText}` : ''}</span>
            <span className="cal__item-title">{i.title}</span>
            <span className="cal__item-time">{i.kindText} {i.timeText}{i.endText ? ` ${i.endText}` : ''}{i.overdueText ? ` · ${i.overdueText}` : ''}</span>
          </InAppLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * #51 "내 주요 일정": two-week Seoul grid under 오늘. Loads through
 * DemoController.runContextOperation so a previous subject's/epoch's calendar is never shown,
 * and clears immediately when the context changes.
 */
export function MiniCalendar({state, controller, loadCalendar, navigate}: Props) {
  const contextId = state.status === 'READY' ? state.context?.contextId ?? null : null;
  const snapshot = state.status === 'READY' ? state.snapshot : null;
  const asOf = snapshot?.asOf ?? null;
  const key = `${state.epoch}:${contextId ?? ''}`;
  const [load, setLoad] = useState<Load | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    setPicked(null);
    if (!contextId || !asOf || !loadCalendar) { setLoad(null); return; }
    setLoad({key, status: 'LOADING'});
    let live = true;
    void controller.runContextOperation((ctx, signal) => loadCalendar(ctx, signal)).then(raw => {
      if (!live) return;
      if (raw === null) { setLoad(null); return; } // stale, denied or cancelled: controller state explains
      const result = buildCalendarView(raw, asOf);
      setLoad(result.ok ? {key, status: 'READY', view: result.view} : {key, status: 'ERROR'});
    });
    return () => { live = false; };
    // snapshot identity changes after resume revalidation (same epoch): reload then too.
  }, [key, contextId, asOf, snapshot, loadCalendar, controller]);

  if (state.status !== 'READY') return null;
  const heading = <h2 id="cal-title">내 주요 일정</h2>;
  if (!loadCalendar) {
    return <section className="section cal" aria-labelledby="cal-title">{heading}<p className="muted">일정 정보 연결을 준비하고 있습니다.</p></section>;
  }
  // Never render a calendar computed for a different key (previous subject or epoch).
  if (!load || load.key !== key || load.status === 'LOADING') {
    return <section className="section cal" aria-labelledby="cal-title" aria-busy="true">{heading}<p className="muted">일정을 불러오는 중</p></section>;
  }
  if (load.status === 'ERROR') {
    return <section className="section cal" aria-labelledby="cal-title">{heading}<p role="alert">일정 자료를 확인할 수 없어 표시하지 않았습니다.</p></section>;
  }

  const {view} = load;
  const selectedDate = picked ?? (view.days.find(d => d.isAsOfDay)?.seoulDate ?? view.days[0]!.seoulDate);
  const selected = view.days.find(d => d.seoulDate === selectedDate)!;
  return (
    <section className="section cal" aria-labelledby="cal-title">
      {heading}
      <p className="muted cal__asof">{view.asOfText}</p>
      <ul className="cal__legend" aria-label="표시 기호">
        {(Object.keys(MARKERS) as MarkerCategory[]).map(m => <li key={m}><Marker category={m} /> {MARKERS[m].text}</li>)}
      </ul>
      <div className="cal__grid">
        {WEEKDAYS.map(w => <span key={w} className="cal__weekday" aria-hidden="true">{w}</span>)}
        {view.days.map(d => (
          <button
            key={d.seoulDate}
            type="button"
            className={'cal__day' + (d.isAsOfDay ? ' is-asof' : '')}
            aria-label={d.ariaLabel}
            aria-pressed={d.seoulDate === selectedDate}
            onClick={() => setPicked(d.seoulDate)}
          >
            <span className="cal__date">{Number(d.seoulDate.slice(8))}</span>
            <span className="cal__marks">{d.markers.map(m => <Marker key={m} category={m} />)}</span>
          </button>
        ))}
      </div>
      <div className="cal__day-detail" aria-live="polite">
        <h3>{selected.dayLabel}</h3>
        {selected.items.length ? <ItemList items={selected.items} navigate={navigate} /> : <p className="muted">이날은 일정이 없어요.</p>}
      </div>
      {view.earlier.length > 0 && <><h3>지난 마감</h3><ItemList items={view.earlier} navigate={navigate} /></>}
      {view.laterCount > 0 && <p className="muted">2주 뒤에도 일정 {view.laterCount}건이 더 있어요.</p>}
      {view.undated.length > 0 && (
        <><h3>날짜 미정</h3>
          <ul className="cal__items">{view.undated.map(u => (
            <li key={u.path}><InAppLink to={u.path} navigate={navigate} className="cal__item"><span className="cal__item-title">{u.title}</span><span className="cal__item-time">{u.reasonText}</span></InAppLink></li>
          ))}</ul></>
      )}
      {view.needsConfirmation.length > 0 && (
        <><h3>적용 여부 확인 필요</h3>
          <ul className="cal__items">{view.needsConfirmation.map((n, i) => (
            <li key={i} className="cal__item"><span className="cal__item-title">{n.title}</span><span className="cal__item-time">{n.text}</span></li>
          ))}</ul></>
      )}
    </section>
  );
}
