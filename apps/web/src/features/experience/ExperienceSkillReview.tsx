import {useCallback, useEffect, useState} from 'react';
import type {ExperienceTagApprovalDelete, ExperienceTagApprovalPut, TopicCode} from '@hufs-one/contracts';
import type {DemoController, DemoViewState} from '../../app/index.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {approvalInput, buildExperienceReviewView, type ExperienceCardView, type ExperienceReviewView} from './skillReviewView.js';

/**
 * #258 port. load() returns an ExperienceReviewPage; approve/revoke map to PUT/DELETE
 * /api/experience/cards/:id/tag-approval with the versions the screen showed. The real adapter
 * needs HufsOwnerApiClient methods for those routes (requested from the API owner).
 */
export interface ExperienceSkillPort {
  load(signal: AbortSignal): Promise<unknown>;
  approve(experienceId: string, input: ExperienceTagApprovalPut, signal: AbortSignal): Promise<unknown>;
  revoke(experienceId: string, input: ExperienceTagApprovalDelete, signal: AbortSignal): Promise<unknown>;
}

type Load =
  | {readonly key: string; readonly kind: 'LOADING'}
  | {readonly key: string; readonly kind: 'ERROR'}
  | {readonly key: string; readonly kind: 'VIEW'; readonly view: ExperienceReviewView};
type Note = {readonly key: string; readonly text: string; readonly alert: boolean};
type Outcome = {ok: true} | {ok: false; text: string};

/** 409/503 stay on this screen with a plain message; 401/403 and others go to the controller, which clears the context. */
function mutationFailure(error: unknown): Outcome {
  if (error instanceof HufsApiError && error.status === 409)
    return {ok: false, text: '다른 탭이나 기기에서 먼저 바뀌어 저장하지 않았습니다. 최신 내용을 다시 불러왔습니다.'};
  if (error instanceof HufsApiError && error.status === 503)
    return {ok: false, text: '지금은 저장할 수 없습니다. 바뀐 것은 없습니다.'};
  throw error;
}

function Card({card, busy, onApprove, onRevoke}: {
  card: ExperienceCardView; busy: boolean;
  onApprove: (card: ExperienceCardView, picked: TopicCode[]) => void; onRevoke: (card: ExperienceCardView) => void;
}) {
  const [picked, setPicked] = useState<TopicCode[]>(() => card.options.filter(o => o.approved).map(o => o.code));
  const id = `exp-${card.experienceId}`;
  const input = approvalInput(card, picked);
  const toggle = (code: TopicCode) => setPicked(p => p.includes(code) ? p.filter(c => c !== code) : [...p, code]);
  return (
    <article className="exp-card" aria-labelledby={id}>
      <h3 id={id}>{card.title}{card.synthetic && <span className="badge exp-card__syn">합성 예시</span>}</h3>

      <section className="exp-stage exp-stage--evidence" aria-label="1단계 내가 쓴 경험">
        <h4><span className="exp-stage__no" aria-hidden="true">1</span> 내가 쓴 경험</h4>
        <p className="muted">{card.versionText}. 원문은 그대로 두고, 아래 후보와 승인은 따로 기록됩니다.</p>
      </section>

      <section className="exp-stage exp-stage--candidate" aria-label="2단계 AI 후보, 검토 필요">
        <h4><span className="exp-stage__no" aria-hidden="true">2</span> AI 후보 <span className="badge">검토 필요</span></h4>
        {card.candidate.kind === 'READY' ? (
          <>
            <ul className="exp-topics">
              {card.candidate.topics.map(t => (
                <li key={t.code}>
                  <strong>{t.label}</strong>
                  {t.skill && <p>역량 후보: {t.skill}</p>}
                  {t.role && <p>역할 후보: {t.role}</p>}
                  {t.quotes.map((q, i) => <blockquote key={i} className="exp-quote">“{q}”</blockquote>)}
                </li>
              ))}
            </ul>
            <p className="muted">AI가 내 글에서 인용한 부분을 근거로 제안한 후보입니다. 승인하기 전에는 추천에 쓰이지 않습니다.</p>
          </>
        ) : <p className="muted">{card.candidate.text}</p>}
      </section>

      <section className="exp-stage exp-stage--approval" aria-label="3단계 내가 승인한 주제">
        <h4><span className="exp-stage__no" aria-hidden="true">3</span> 내가 승인한 주제</h4>
        {card.approval.kind === 'ACTIVE' ? (
          <p><strong>{card.approval.topics.map(t => t.label).join(', ')}</strong> <span className="muted">({card.approval.approvedAt} 승인)</span></p>
        ) : <p>{card.approval.text}</p>}
        {card.options.length > 0 && (
          <fieldset className="exp-pick" disabled={busy}>
            <legend>승인할 주제 고르기 (1~5개)</legend>
            {card.options.map(o => (
              <label key={o.code} className="exp-pick__opt">
                <input type="checkbox" checked={picked.includes(o.code)} onChange={() => toggle(o.code)} /> {o.label}
              </label>
            ))}
            <div className="exp-pick__actions">
              <button type="button" className="button" disabled={!input} onClick={() => onApprove(card, picked)}>선택한 주제 승인</button>
              {card.approval.kind === 'ACTIVE' && <button type="button" className="button button--quiet" onClick={() => onRevoke(card)}>승인 취소</button>}
            </div>
          </fieldset>
        )}
        <p className="muted">승인은 내가 고른 관심 주제 표시일 뿐, 역량 증명·자격·채용 적격 판정이 아닙니다.</p>
      </section>
    </article>
  );
}

/**
 * Loads and writes only through DemoController.runContextOperation, keyed by epoch + context + snapshot,
 * so a late response from another student, an earlier snapshot or a closed tab is dropped, and a
 * 401/403 clears the screen through the controller state.
 */
export function ExperienceSkillReview({state, controller, port}: {
  state: DemoViewState; controller: DemoController; port: ExperienceSkillPort;
}) {
  const snapshot = state.status === 'READY' ? state.snapshot : null;
  const key = `${state.epoch}:${state.context?.contextId ?? ''}:${snapshot?.asOf ?? ''}`;
  const [load, setLoad] = useState<Load | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!snapshot) { setLoad(null); return; }
    let live = true;
    setLoad({key, kind: 'LOADING'});
    void controller.runContextOperation(async (_ctx, signal) => ({raw: await port.load(signal)})).then(r => {
      if (!live) return;
      if (r === null) { setLoad(null); return; }
      const v = buildExperienceReviewView(r.raw);
      setLoad(v.ok ? {key, kind: 'VIEW', view: v.view} : {key, kind: 'ERROR'});
    });
    return () => { live = false; };
  }, [key, snapshot, port, controller, round]);

  const mutate = useCallback(async (run: (signal: AbortSignal) => Promise<unknown>, done: string) => {
    setBusy(true); setNote(null);
    const r = await controller.runContextOperation(async (_ctx, signal): Promise<Outcome> => {
      try { await run(signal); return {ok: true}; } catch (error) { return mutationFailure(error); }
    });
    setBusy(false);
    if (r === null) return; // stale or denied: the controller state explains
    setNote({key, text: r.ok ? done : r.text, alert: !r.ok});
    setRound(n => n + 1); // always re-read: the server's versions are the only truth after a write attempt
  }, [controller, key]);

  if (!snapshot || !load || load.key !== key) return null;
  const head = <h2 id="exp-review">경험에서 고른 관심 주제</h2>;
  if (load.kind === 'LOADING') return <section className="section exp-review" aria-labelledby="exp-review" aria-busy="true">{head}<p className="muted">경험 기록을 불러오는 중</p></section>;
  if (load.kind === 'ERROR') return <section className="section exp-review" aria-labelledby="exp-review">{head}<p role="alert">경험 자료 형식을 확인할 수 없어 표시하지 않았습니다.</p></section>;
  const {view} = load;
  const shown = note && note.key === key ? note : null;
  return (
    <section className="section exp-review" aria-labelledby="exp-review" aria-busy={busy}>
      {head}
      <p className="muted">HUFS One AI 안에서 직접 쓴 경험만 다룹니다. 학교 시스템의 경험 기록과 연결된 화면이 아닙니다. 기준 시각 {view.asOf}.</p>
      <p role={shown?.alert ? 'alert' : 'status'} className={shown ? 'notice-box' : 'visually-hidden'}>{shown?.text ?? ''}</p>
      {view.cards.length === 0
        ? <p>아직 기록한 경험이 없습니다. 경험을 먼저 남기면 여기에서 주제를 고를 수 있습니다.</p>
        : view.cards.map(card => (
          <Card key={`${card.experienceId}:${card.expected.expectedApprovalVersion}:${card.expected.expectedContentVersion}:${card.expected.expectedConsentVersion}`}
            card={card} busy={busy}
            onApprove={(c, picked) => {
              const input = approvalInput(c, picked);
              if (input) void mutate(signal => port.approve(c.experienceId, input, signal), `「${c.title}」의 주제를 승인했습니다.`);
            }}
            onRevoke={c => void mutate(signal => port.revoke(c.experienceId, c.expected, signal), `「${c.title}」의 승인을 취소했습니다.`)} />
        ))}
      {view.partial && <p className="muted">경험이 더 있습니다. 이 목록은 일부이며 전체 주제 목록이 아닙니다.</p>}
    </section>
  );
}
