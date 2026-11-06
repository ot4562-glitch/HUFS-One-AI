import {useEffect, useId, useState} from 'react';
import type {DemoContext, DemoSnapshot} from '@hufs-one/contracts';
import type {DemoController, DemoViewState} from '../../app/index.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {studentFacingText} from '../../shell/studentText.js';
import {buildPlanCheckView, termText, type PlanCheckView} from './planCheckView.js';

/**
 * #81 port: the owner plan check for one term at the screen's asOf. The real path is
 * OwnerApiClient.checkStudyPlan (POST /api/study-plans/check); the browser sends only the term.
 * null = no saved plan to check.
 */
export interface PlanCheckPort {
  readonly terms: readonly string[];
  check(context: DemoContext, term: string, signal: AbortSignal): Promise<unknown | null>;
}

type Load = (
  | {readonly key: string; readonly kind: 'LOADING'}
  | {readonly key: string; readonly kind: 'NONE'}
  | {readonly key: string; readonly kind: 'ERROR'}
  | {readonly key: string; readonly kind: 'STALE'}
  | {readonly key: string; readonly kind: 'UNAVAILABLE'}
  | {readonly key: string; readonly kind: 'VIEW'; readonly view: PlanCheckView}) & {readonly snapshot: DemoSnapshot};

/**
 * Loads through DemoController.runContextOperation keyed by epoch + context + snapshot + term and renders
 * only a result for that exact key. 409 (plan changed) and 503 (check not available) stay inside this
 * panel; 401/403 go to the controller, which clears the whole screen like any context error.
 */
export function PlanCheckPanel({state, controller, port}: {state: DemoViewState; controller: DemoController; port: PlanCheckPort}) {
  const snapshot = state.status === 'READY' ? state.snapshot : null;
  const [term, setTerm] = useState(port.terms[0] ?? '');
  const [attempt, setAttempt] = useState(0);
  const key = `${state.epoch}:${state.context?.contextId ?? ''}:${snapshot?.asOf ?? ''}:${term}:${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);
  const selectId = useId();

  useEffect(() => {
    if (!snapshot || !term) { setLoad(null); return; }
    let live = true;
    setLoad({key, snapshot, kind: 'LOADING'});
    void controller.runContextOperation(async (ctx, signal) => {
      try {
        return {raw: await port.check(ctx, term, signal)} as const;
      } catch (error) {
        if (error instanceof HufsApiError && error.status === 409) return {failed: 'STALE'} as const;
        if (error instanceof HufsApiError && error.status === 503) return {failed: 'UNAVAILABLE'} as const;
        throw error;
      }
    }).then(r => {
      if (!live) return;
      if (r === null) { setLoad(null); return; } // stale / denied: the controller state explains
      if ('failed' in r) { setLoad({key, snapshot, kind: r.failed}); return; }
      if (r.raw === null) { setLoad({key, snapshot, kind: 'NONE'}); return; }
      const v = buildPlanCheckView(r.raw, {term, asOf: snapshot.asOf});
      setLoad(v.ok ? {key, snapshot, kind: 'VIEW', view: v.view} : {key, snapshot, kind: 'ERROR'});
    });
    return () => { live = false; };
  }, [key, snapshot, term, port, controller]);

  if (!snapshot) return null;
  const current = load && load.key === key && load.snapshot === snapshot ? load : null;
  return (
    <section className="section plan" aria-labelledby="plan-title" aria-busy={current?.kind === 'LOADING' || !current}>
      <div className="section__head"><h2 id="plan-title">수강계획 검사</h2></div>
      {port.terms.length > 1 && (
        <p className="plan__term">
          <label htmlFor={selectId}>검사할 학기</label>{' '}
          <select id={selectId} value={term} onChange={e => setTerm(e.target.value)}>
            {port.terms.map(t => <option key={t} value={t}>{termText(t)}</option>)}
          </select>
        </p>
      )}
      {(!current || current.kind === 'LOADING') && <p className="muted">계획을 검사하는 중</p>}
      {current?.kind === 'NONE' && <p className="muted">이 학기에 저장된 수강계획이 없습니다.</p>}
      {current?.kind === 'ERROR' && <p role="alert">계획 검사 자료를 확인할 수 없어 표시하지 않았습니다.</p>}
      {current?.kind === 'UNAVAILABLE' && <p role="status">지금은 계획 검사를 사용할 수 없습니다. 검수된 규칙·자료가 준비되면 열립니다.</p>}
      {current?.kind === 'STALE' && (
        <p role="status">
          그 사이 계획이 바뀌었습니다.{' '}
          <button type="button" className="button" onClick={() => setAttempt(n => n + 1)}>다시 검사</button>
        </p>
      )}
      {current?.kind === 'VIEW' && <Result view={current.view} />}
    </section>
  );
}

function Result({view}: {view: PlanCheckView}) {
  return (
    <>
      <p role="status"><strong>{view.term} · {view.stateText}</strong></p>
      <p>{view.loadText}{view.capText ? <> · {view.capText}</> : <span className="muted"> · 최대 학점은 규칙 검수 전이라 표시하지 않습니다</span>}</p>
      {view.redactedText && <p className="muted">{view.redactedText}</p>}
      {view.issues.length > 0
        ? (
          <ul className="plan__issues" aria-label="계획 검사 결과">
            {view.issues.map(i => (
              <li key={i.key} className="plan__issue">
                <span className="plan__badge"><span aria-hidden="true">{i.badge.icon}</span> {i.badge.text}</span> {studentFacingText(i.text)}
                <span className="muted"> · {studentFacingText(i.courses)}</span>
              </li>
            ))}
          </ul>
        )
        : <p className="muted">검사에서 찾은 문제가 없습니다. 규칙 검수 상태는 아래 안내를 확인해 주세요.</p>}
      {view.unchecked.length > 0 && (
        <>
          <h3 className="plan__sub">검사하지 못한 과목</h3>
          <ul>{view.unchecked.map(u => <li key={u}>{studentFacingText(u)}</li>)}</ul>
        </>
      )}
      <ul className="muted plan__caveats">{view.caveats.map(c => <li key={c}>{studentFacingText(c)}</li>)}</ul>
      <p className="muted">{studentFacingText(view.versionText)}</p>
    </>
  );
}
