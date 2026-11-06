import {useId, useState, type FormEvent} from 'react';
import type {DemoContext, DemoSnapshot} from '@hufs-one/contracts';
import type {DemoController, DemoViewState} from '../../app/index.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {studentFacingText} from '../../shell/studentText.js';
import {ACTION_TEXT, HYPOTHETICAL_TEXT, buildWhatIfView, needsTarget, type Scenario, type ScenarioAction, type WhatIfView} from './whatIfView.js';

/**
 * #82 port: one hypothetical scenario for the current context. The real path is
 * OwnerApiClient.checkMajorWhatIf (POST /api/academics/major-what-if); the browser sends only the scenario.
 */
export interface WhatIfPort {
  /** Programs the student may pick as a hypothetical target. */
  readonly programs: readonly {readonly id: string; readonly label: string}[];
  /** True for the dev synthetic stand-in, so the result says it is an example. */
  readonly synthetic?: boolean;
  check(context: DemoContext, scenario: Scenario, signal: AbortSignal): Promise<unknown>;
}

type Result = (
  | {readonly key: string; readonly kind: 'LOADING'}
  | {readonly key: string; readonly kind: 'ERROR' | 'STALE' | 'UNAVAILABLE'}
  | {readonly key: string; readonly kind: 'VIEW'; readonly view: WhatIfView}) & {readonly snapshot: DemoSnapshot};

const ACTIONS = Object.keys(ACTION_TEXT) as ScenarioAction[];

/**
 * Runs only when the student asks (it is a POST), through DemoController.runContextOperation. A result is
 * keyed by epoch + context + snapshot + submission and is dropped when any of them changes, and editing
 * the form clears the old result so it can never sit next to a scenario it was not computed for.
 * 409 / 503 stay in the panel; 401/403 go to the controller, which clears the screen.
 */
export function WhatIfPanel({state, controller, port}: {state: DemoViewState; controller: DemoController; port: WhatIfPort}) {
  const snapshot = state.status === 'READY' ? state.snapshot : null;
  const scope = `${state.epoch}:${state.context?.contextId ?? ''}:${snapshot?.asOf ?? ''}`;
  const [action, setAction] = useState<ScenarioAction>('CHANGE_DOUBLE_MAJOR');
  const [target, setTarget] = useState(port.programs[0]?.id ?? '');
  const [submission, setSubmission] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const actionId = useId(), targetId = useId();

  if (!snapshot) return null;
  const withTarget = needsTarget(action);
  const key = `${scope}:${submission}`;
  const shown = result && result.key === key && result.snapshot === snapshot ? result : null;

  const edit = (f: () => void) => { f(); setResult(null); setSubmission(n => n + 1); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (withTarget && !target) return;
    const scenario = (withTarget ? {action, targetMajorId: target} : {action}) as Scenario;
    const label = withTarget ? port.programs.find(p => p.id === target)?.label ?? null : null;
    const next = submission + 1, runKey = `${scope}:${next}`;
    setSubmission(next);
    setResult({key: runKey, snapshot, kind: 'LOADING'});
    void controller.runContextOperation(async (ctx, signal) => {
      try {
        return {raw: await port.check(ctx, scenario, signal)} as const;
      } catch (error) {
        if (error instanceof HufsApiError && error.status === 409) return {failed: 'STALE'} as const;
        if (error instanceof HufsApiError && error.status === 503) return {failed: 'UNAVAILABLE'} as const;
        throw error;
      }
    }).then(r => {
      if (r === null) return; // stale / denied: the controller state explains
      setResult(prev => {
        if (!prev || prev.key !== runKey) return prev; // a newer submission or edit won
        if ('failed' in r) return {key: runKey, snapshot, kind: r.failed};
        const v = buildWhatIfView(r.raw, {scenario, asOf: snapshot.asOf, targetLabel: label});
        return v.ok ? {key: runKey, snapshot, kind: 'VIEW', view: v.view} : {key: runKey, snapshot, kind: 'ERROR'};
      });
    });
  };

  return (
    <section className="section whatif" aria-labelledby="whatif-title">
      <div className="section__head"><h2 id="whatif-title">전공을 바꾸면? 가정 분석</h2></div>
      <p className="notice-box" role="note">{HYPOTHETICAL_TEXT}</p>
      <form className="whatif__form" onSubmit={submit}>
        <p>
          <label htmlFor={actionId}>가정</label>
          <select id={actionId} value={action} onChange={e => edit(() => setAction(e.target.value as ScenarioAction))}>
            {ACTIONS.map(a => <option key={a} value={a}>{ACTION_TEXT[a]}</option>)}
          </select>
        </p>
        {withTarget && (
          <p>
            <label htmlFor={targetId}>가정할 전공</label>
            <select id={targetId} value={target} onChange={e => edit(() => setTarget(e.target.value))}>
              {port.programs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </p>
        )}
        <p><button type="submit" className="button" disabled={shown?.kind === 'LOADING'}>가정 분석하기</button></p>
      </form>
      <div aria-live="polite">
        {shown?.kind === 'LOADING' && <p className="muted">가정 분석하는 중</p>}
        {shown?.kind === 'ERROR' && <p role="alert">가정 분석 자료를 확인할 수 없어 표시하지 않았습니다.</p>}
        {shown?.kind === 'UNAVAILABLE' && <p>지금은 가정 분석을 사용할 수 없습니다. 검수된 규칙·자료가 준비되면 열립니다.</p>}
        {shown?.kind === 'STALE' && <p>그 사이 현재 학업 정보가 바뀌었습니다. 다시 분석해 주세요.</p>}
        {shown?.kind === 'VIEW' && <Outcome view={shown.view} synthetic={Boolean(port.synthetic)} />}
      </div>
    </section>
  );
}

function Outcome({view, synthetic}: {view: WhatIfView; synthetic: boolean}) {
  if (view.kind === 'BLOCKED') {
    return (
      <div className="whatif__result">
        <h3>{view.title}: 지금은 분석할 수 없습니다</h3>
        <ul>{view.blockers.map(b => <li key={b}>{studentFacingText(b)}</li>)}</ul>
        <p className="muted">결과를 추측해 보여 주지 않습니다.</p>
      </div>
    );
  }
  return (
    <div className="whatif__result">
      <h3>{view.title}{synthetic && <span className="badge whatif__syn">합성 예시</span>}</h3>
      <dl className="credits">
        <div><dt>취득 (그대로)</dt><dd>{view.earned}</dd></div>
        <div><dt>지금 남은 학점</dt><dd>{view.remainingBefore}</dd></div>
        <div><dt>가정 시 남은 학점</dt><dd>{view.remainingAfter}</dd></div>
      </dl>
      <div className="whatif__table-wrap">
        <table className="whatif__table">
          <caption className="visually-hidden">지금 전공과 가정 전공의 요건 비교</caption>
          <thead><tr><th scope="col">요건</th><th scope="col">바뀌는 점</th><th scope="col">지금</th><th scope="col">가정</th></tr></thead>
          <tbody>
            {view.rows.map(r => (
              <tr key={r.id} aria-label={studentFacingText(r.ariaLabel)}>
                <th scope="row">{studentFacingText(r.id)}</th>
                <td><span className="whatif__badge"><span aria-hidden="true">{r.badge.icon}</span> {r.badge.text}</span></td>
                <td>{r.before}</td>
                <td>{r.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">{studentFacingText(view.rulePackText)}</p>
    </div>
  );
}
