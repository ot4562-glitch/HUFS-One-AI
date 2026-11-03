import {useEffect, useState} from 'react';
import type {DemoController, DemoViewState} from '../../app/index.js';
import {buildRevisionView, type RevisionScreenView, type RevisionSideView} from './revisionView.js';

/**
 * #119 port: the comparison for one opportunity at the screen's asOf, or null when there is no
 * reviewed correction to show. The real path needs HufsApiClient support for
 * POST /api/opportunities/:id/revisions/compare plus a way to learn the two revision ids (#119 comment).
 */
export interface RevisionPort {
  forOpportunity(opportunityId: string, asOf: string, signal: AbortSignal): Promise<unknown | null>;
}

type Load =
  | {readonly key: string; readonly kind: 'LOADING'}
  | {readonly key: string; readonly kind: 'NONE'}
  | {readonly key: string; readonly kind: 'ERROR'}
  | {readonly key: string; readonly kind: 'VIEW'; readonly view: RevisionScreenView};

const ICON: Record<string, string> = {'arrow-right': '→', 'arrow-left': '←', ban: '⊘', pencil: '✎', equal: '=', help: '?'};

function Side({title, s}: {title: string; s: RevisionSideView}) {
  return (
    <div className="rev__side">
      <h4>{title}</h4>
      <dl className="facts">
        <dt>수집 시각</dt><dd>{s.captured}</dd>
        <dt>마지막 확인</dt><dd>{s.checked}</dd>
        <dt>사실 검증</dt><dd>{s.verified}</dd>
        <dt>제공 방식</dt><dd>{s.delivery}</dd>
        <dt>근거</dt><dd>{s.evidenceCount}건</dd>
      </dl>
    </div>
  );
}

/**
 * Loads through DemoController.runContextOperation keyed by epoch + context + snapshot + opportunity, and
 * renders only a result issued for that exact key, so another student's or an earlier screen's
 * comparison never appears, even for one frame.
 */
export function RevisionComparison({opportunityId, state, controller, port}: {
  opportunityId: string; state: DemoViewState; controller: DemoController; port: RevisionPort;
}) {
  const snapshot = state.status === 'READY' ? state.snapshot : null;
  const key = `${state.epoch}:${state.context?.contextId ?? ''}:${opportunityId}:${snapshot?.asOf ?? ''}`;
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    if (!snapshot) { setLoad(null); return; }
    let live = true;
    setLoad({key, kind: 'LOADING'});
    void controller.runContextOperation(async (_ctx, signal) => ({raw: await port.forOpportunity(opportunityId, snapshot.asOf, signal)}))
      .then(r => {
        if (!live) return;
        if (r === null) { setLoad(null); return; } // stale / denied: the controller state explains
        if (r.raw === null) { setLoad({key, kind: 'NONE'}); return; }
        const v = buildRevisionView(r.raw, {opportunityId, asOf: snapshot.asOf});
        setLoad(v.ok ? {key, kind: 'VIEW', view: v.view} : {key, kind: 'ERROR'});
      });
    return () => { live = false; };
  }, [key, snapshot, opportunityId, port, controller]);

  if (!snapshot || !load || load.key !== key || load.kind === 'NONE') return null;
  const head = <h3 id={`rev-${opportunityId}`}>정정 내역</h3>;
  if (load.kind === 'LOADING') return <section className="section rev" aria-labelledby={`rev-${opportunityId}`} aria-busy="true">{head}<p className="muted">정정 내역을 확인하는 중</p></section>;
  if (load.kind === 'ERROR') return <section className="section rev" aria-labelledby={`rev-${opportunityId}`}>{head}<p role="alert">정정 내역 자료를 확인할 수 없어 표시하지 않았습니다.</p></section>;
  const {view} = load;
  if (view.kind === 'NEEDS_REVIEW') {
    return <section className="section rev" aria-labelledby={`rev-${opportunityId}`}>{head}<p className="notice-box" role="note">{view.text}</p></section>;
  }
  return (
    <section className="section rev" aria-labelledby={`rev-${opportunityId}`}>
      {head}
      <p role="status"><strong>{view.summary}</strong>{view.synthetic && <span className="badge rev__syn">합성 정정 예시</span>}</p>
      <div className="rev__table-wrap">
        <table className="rev__table">
          <caption className="visually-hidden">정정 전과 정정 후 비교</caption>
          <thead><tr><th scope="col">항목</th><th scope="col">정정 전</th><th scope="col">정정 후</th><th scope="col">상태</th></tr></thead>
          <tbody>
            {view.rows.map(r => (
              <tr key={r.field} className={`rev__row rev__row--${r.state.toLowerCase()}`} aria-label={r.ariaLabel}>
                <th scope="row">{r.label}</th>
                <td>{r.before}</td>
                <td>{r.state === 'CHANGED' ? <strong>{r.after}</strong> : r.after}</td>
                <td><span className="rev__badge"><span aria-hidden="true">{ICON[r.badge.icon]}</span> {r.badge.text}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rev__sides">
        <Side title="정정 전 판본" s={view.before} />
        <Side title="정정 후 판본" s={view.after} />
      </div>
      <p className="muted">수집 시각은 사실을 검증한 시각이 아닙니다. 신청 직전에는 공식 공고에서 다시 확인해 주세요.</p>
    </section>
  );
}
