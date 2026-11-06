import {useEffect, useState} from 'react';
import type {DemoContext} from '@hufs-one/contracts';
import type {DemoController, DemoViewState} from '../../app/index.js';
import {buildDoubleMajorView, type DoubleMajorView, type MajorColumnView} from './doubleMajorView.js';
import {studentFacingText} from '../../shell/studentText.js';

/**
 * #144 port: the current primary + chosen double major audit for this context at the screen's asOf, or
 * null when not available. The real path is the owner double-major API (#150, draft).
 */
export interface DoubleMajorPort {
  forContext(context: DemoContext, asOf: string, signal: AbortSignal): Promise<unknown | null>;
}

type Load =
  | {readonly key: string; readonly kind: 'LOADING'}
  | {readonly key: string; readonly kind: 'NONE'}
  | {readonly key: string; readonly kind: 'ERROR'}
  | {readonly key: string; readonly kind: 'VIEW'; readonly view: DoubleMajorView};

function Column({c}: {c: MajorColumnView}) {
  return (
    <div className="dm__col">
      <h4>{c.role}</h4>
      <p><strong>{c.stateText}</strong> <span className="muted">· {studentFacingText(c.rulePackText)}</span></p>
      <ul className="dm__rows" aria-label={`${c.role} 요건`}>
        {c.rows.map(r => (
          <li key={r.id} className={`dm__row${r.heldText ? ' dm__row--held' : ''}`} aria-label={studentFacingText(r.ariaLabel)}>
            <span className="dm__badge"><span aria-hidden="true">{r.badge.icon}</span> {r.badge.text}</span>
            <span className="dm__id">{studentFacingText(r.id)}</span>
            {r.creditsText && <span className="muted">{r.creditsText}</span>}
            {r.heldText && <span className="dm__held">{studentFacingText(r.heldText)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Loads through DemoController.runContextOperation keyed by epoch + context + snapshot, and renders only
 * a result issued for that exact key, so another student's majors never appear, even for one frame.
 */
export function DoubleMajorPanel({state, controller, port}: {state: DemoViewState; controller: DemoController; port: DoubleMajorPort}) {
  const snapshot = state.status === 'READY' ? state.snapshot : null;
  const key = `${state.epoch}:${state.context?.contextId ?? ''}:${snapshot?.asOf ?? ''}`;
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    if (!snapshot) { setLoad(null); return; }
    let live = true;
    setLoad({key, kind: 'LOADING'});
    void controller.runContextOperation(async (ctx, signal) => ({raw: await port.forContext(ctx, snapshot.asOf, signal)}))
      .then(r => {
        if (!live) return;
        if (r === null) { setLoad(null); return; } // stale / denied: the controller state explains
        if (r.raw === null) { setLoad({key, kind: 'NONE'}); return; }
        const v = buildDoubleMajorView(r.raw, {asOf: snapshot.asOf});
        setLoad(v.ok ? {key, kind: 'VIEW', view: v.view} : {key, kind: 'ERROR'});
      });
    return () => { live = false; };
  }, [key, snapshot, port, controller]);

  if (!snapshot || !load || load.key !== key || load.kind === 'NONE') return null;
  const head = <h3 id="dm-title">주전공 · 이중전공 요건</h3>;
  if (load.kind === 'LOADING') return <section className="section dm" aria-labelledby="dm-title" aria-busy="true">{head}<p className="muted">전공별 요건을 확인하는 중</p></section>;
  if (load.kind === 'ERROR') return <section className="section dm" aria-labelledby="dm-title">{head}<p role="alert">전공별 요건 자료를 확인할 수 없어 표시하지 않았습니다.</p></section>;
  const {view} = load;
  return (
    <section className="section dm" aria-labelledby="dm-title">
      {head}
      <p role="status"><strong>{view.selectionText}</strong></p>
      <p className="notice-box" role="note">{view.notOfficialText}</p>
      <h4 className="dm__sub">전체 이수 학점 <span className="muted">(한 과목은 한 번만 셉니다)</span></h4>
      <dl className="credits">
        {view.uniqueCredits.map(c => <div key={c.label}><dt>{c.label}</dt><dd>{c.credits}</dd></div>)}
      </dl>
      {view.overlapText && <p className="dm__overlap">{studentFacingText(view.overlapText)}</p>}
      <div className="dm__cols">
        <Column c={view.primary} />
        {view.doubleMajor ? <Column c={view.doubleMajor} /> : <p className="muted dm__note">{view.doubleMajorNote}</p>}
      </div>
    </section>
  );
}
