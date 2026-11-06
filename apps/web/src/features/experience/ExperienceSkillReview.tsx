import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {TopicCode} from '@hufs-one/contracts';
import type {DemoController, DemoViewState} from '../../app/index.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {InAppLink} from '../../shell/AppShell.js';
import {inAppHref} from '../../shell/router.js';
import {approvalInput, buildExperienceReviewView, type ExperienceCardView, type ExperienceReviewView} from './skillReviewView.js';

import type {ExperienceSkillPort} from './experienceSkillPort.js';
export type {ExperienceSkillPort} from './experienceSkillPort.js';

export interface ExperienceReviewScope {
  readonly key: string;
  readonly ready: boolean;
  read<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T | null>;
  mutate<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T | null>;
}
interface ExperienceOpportunity {
  readonly id: string;
  readonly title: string;
  readonly topics: readonly TopicCode[];
}

type Load =
  | {readonly key: string; readonly scope: ExperienceReviewScope; readonly kind: 'LOADING'}
  | {readonly key: string; readonly scope: ExperienceReviewScope; readonly kind: 'ERROR'}
  | {readonly key: string; readonly scope: ExperienceReviewScope; readonly kind: 'VIEW'; readonly view: ExperienceReviewView};
type Note = {readonly key: string; readonly scope: ExperienceReviewScope; readonly text: string; readonly alert: boolean};
type Outcome = {ok: true; text: string} | {ok: false; text: string};

/** 409/503 stay on this screen with a plain message; 401/403 and others go to the controller, which clears the context. */
function mutationFailure(error: unknown): Outcome {
  if (error instanceof HufsApiError && error.status === 409)
    return {ok: false, text: '다른 탭이나 기기에서 먼저 바뀌어 저장하지 않았습니다. 최신 내용을 다시 불러왔습니다.'};
  if (error instanceof HufsApiError && error.status === 503)
    return {ok: false, text: '처리 결과를 확인할 수 없습니다. 최신 내용을 다시 조회합니다. AI 요청은 같은 요청 번호로만 재확인합니다.'};
  if (error instanceof HufsApiError && error.status === 422)
    return {ok: false, text: '입력 내용이나 현재 동의·근거를 확인해 주세요. 승인되지 않은 입력은 실행하지 않습니다.'};
  throw error;
}

function Card({card, busy, onApprove, onRevoke, onRemove}: {
  card: ExperienceCardView; busy: boolean;
  onApprove: (card: ExperienceCardView, picked: TopicCode[], manual: boolean) => void; onRevoke: (card: ExperienceCardView) => void;
  onRemove?: ((card: ExperienceCardView) => void) | undefined;
}) {
  const [picked, setPicked] = useState<TopicCode[]>(() => card.options.filter(o => o.approved).map(o => o.code));
  const [manual, setManual] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const id = `exp-${card.experienceId}`;
  const input = approvalInput(card, picked, manual);
  const options = [...card.options, ...(manual ? card.manualOptions : [])];
  const cancelDelete = () => { setConfirmDelete(false); deleteButton.current?.focus(); };
  const toggle = (code: TopicCode) => setPicked(p => p.includes(code) ? p.filter(c => c !== code) : [...p, code]);
  return (
    <article className="exp-card" aria-labelledby={id}>
      <h3 id={id}>{card.title}{card.synthetic && <span className="badge exp-card__syn">합성 예시</span>}</h3>

      <section className="exp-stage exp-stage--evidence" aria-label="1단계 내가 쓴 경험">
        <h4><span className="exp-stage__no" aria-hidden="true">1</span> 내가 쓴 경험</h4>
        <p className="muted">{card.versionText}. 원문은 그대로 두고, 아래 후보와 승인은 따로 기록됩니다.</p>
        {card.summary && <p className="exp-summary">{card.summary}</p>}
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
        {(card.options.length > 0 || card.manualOptions.length > 0) && (
          <fieldset className="exp-pick" disabled={busy}>
            <legend>승인할 주제 고르기 (1~5개)</legend>
            {card.manualOptions.length > 0 && <label className="exp-pick__opt"><input type="checkbox" checked={manual}
              onChange={event => { setManual(event.target.checked); if (!event.target.checked) setPicked(p => p.filter(code => card.options.some(o => o.code === code))); }} />다른 관심 주제 직접 고르기</label>}
            {options.map(o => (
              <label key={o.code} className="exp-pick__opt">
                <input type="checkbox" checked={picked.includes(o.code)} onChange={() => toggle(o.code)} /> {o.label}
              </label>
            ))}
            <div className="exp-pick__actions">
              <button type="button" className="button" disabled={!input} onClick={() => onApprove(card, picked, manual)}>선택한 주제 승인</button>
              {card.approval.kind === 'ACTIVE' && <button type="button" className="button button--quiet" onClick={() => onRevoke(card)}>승인 취소</button>}
            </div>
          </fieldset>
        )}
        <p className="muted">승인은 내가 고른 관심 주제 표시일 뿐, 역량 증명·자격·채용 적격 판정이 아닙니다.</p>
      </section>
      {onRemove && <div>
        <button type="button" className="button button--quiet" ref={deleteButton} disabled={busy}
          onClick={() => setConfirmDelete(true)}>경험 삭제</button>
        {confirmDelete && <div role="alert" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelDelete(); } }}>
          <p>이 경험과 연결된 주제 승인을 삭제할까요? 삭제 전에는 취소할 수 있습니다.</p>
          <button type="button" className="button" disabled={busy} onClick={() => onRemove(card)}>삭제 확인</button>{' '}
          <button type="button" className="button button--quiet" disabled={busy} onClick={cancelDelete}>삭제 취소</button>
        </div>}
      </div>}
    </article>
  );
}

/**
 * Loads and writes only through DemoController.runContextOperation, keyed by epoch + context + snapshot,
 * so a late response from another student, an earlier snapshot or a closed tab is dropped, and a
 * 401/403 clears the screen through the controller state.
 */
export function ExperienceSkillReview({state, controller, port, navigate}: {
  state: DemoViewState; controller: DemoController; port: ExperienceSkillPort;
  navigate?: ((path: string) => void) | undefined;
}) {
  const profile = state.profiles.find(p => p.demoSubjectId === state.selected);
  const snapshot = state.status === 'READY' && profile?.allowedSections.includes('EXPERIENCE') ? state.snapshot : null;
  const key = `${state.epoch}:${state.context?.contextId ?? ''}:${snapshot?.asOf ?? ''}:${JSON.stringify(snapshot?.versions ?? {})}`;
  const scope = useMemo<ExperienceReviewScope>(() => ({key, ready: !!snapshot,
    read: run => controller.runContextOperation((_ctx, signal) => run(signal)),
    mutate: run => controller.runContextOperation((_ctx, signal) => run(signal)),
  }), [key, snapshot, controller]);
  const allowedFeed = profile?.allowedSections.includes('FEED');
  const opportunities = snapshot && allowedFeed
    ? [...snapshot.feed.featured, ...snapshot.feed.compact].map(o => ({id: o.opportunityId, title: o.title, topics: o.topics})) : [];
  return <ExperienceReviewPanel key={key} scope={scope} port={port} opportunities={opportunities} navigate={navigate} />;
}

/** Shared presentation. Synthetic contexts and real BETA owners never share a controller or a port. */
export function ExperienceReviewPanel({scope, port, opportunities = [], navigate}: {
  scope: ExperienceReviewScope; port: ExperienceSkillPort; opportunities?: readonly ExperienceOpportunity[];
  navigate?: ((path: string) => void) | undefined;
}) {
  const key = scope.key;
  const [load, setLoad] = useState<Load | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const mutationLock = useRef(false);

  useEffect(() => {
    if (!scope.ready) { setLoad(null); return; }
    let live = true;
    setLoad({key, scope, kind: 'LOADING'});
    void scope.read(async signal => {
      try { return {raw: await port.load(signal)}; }
      catch (error) {
        if (error instanceof HufsApiError && (error.status === 409 || error.status === 503)) return {raw: null};
        throw error;
      }
    }).then(r => {
      if (!live) return;
      if (r === null) { setLoad(null); return; }
      const v = buildExperienceReviewView(r.raw);
      setLoad(v.ok ? {key, scope, kind: 'VIEW', view: v.view} : {key, scope, kind: 'ERROR'});
    });
    return () => { live = false; };
  }, [scope, port, round]);

  const mutate = useCallback(async (run: (signal: AbortSignal) => Promise<unknown>, done: string | ((value: unknown) => string)) => {
    if (mutationLock.current) return false;
    mutationLock.current = true; setBusy(true); setNote(null);
    const r = await scope.mutate(async (signal): Promise<Outcome> => {
      try { const value = await run(signal); return {ok: true, text: typeof done === 'function' ? done(value) : done}; } catch (error) { return mutationFailure(error); }
    });
    mutationLock.current = false; setBusy(false);
    if (r === null) return false; // stale or denied: the controller state explains
    setNote({key, scope, text: r.text, alert: !r.ok});
    setRound(n => n + 1); // always re-read: the server's versions are the only truth after a write attempt
    return r.ok;
  }, [scope, key]);

  if (!scope.ready || !load || load.key !== key || load.scope !== scope) return null;
  const head = <h2 id="exp-review">경험에서 고른 관심 주제</h2>;
  if (load.kind === 'LOADING') return <section className="section exp-review" aria-labelledby="exp-review" aria-busy="true">{head}<p className="muted">경험 기록을 불러오는 중</p></section>;
  if (load.kind === 'ERROR') return <section className="section exp-review" aria-labelledby="exp-review">{head}<p role="alert">경험 자료의 현재 판본이나 서버 응답을 확인할 수 없어 표시하지 않았습니다.</p><button type="button" className="button" onClick={() => setRound(n => n + 1)}>최신 경험 다시 조회</button></section>;
  const {view} = load;
  const selectedCards = view.cards.filter(card => card.canRequest && selected.includes(card.experienceId));
  const shown = note && note.key === key && note.scope === scope ? note : null;
  const approvedTopics = new Map(view.cards.flatMap(card => card.approval.kind === 'ACTIVE'
    ? card.approval.topics.map(topic => [topic.code, topic.label] as const) : []));
  const matching = opportunities.filter(o => o.topics.some(topic => approvedTopics.has(topic))).slice(0, 3);
  return (
    <section className="section exp-review" aria-labelledby="exp-review" aria-busy={busy}>
      {head}
      <p className="muted">HUFS One AI 안에서 직접 쓴 경험만 다룹니다. 학교 시스템의 경험 기록과 연결된 화면이 아닙니다. 기준 시각 {view.asOf}.</p>
      {port.create && <form className="sandbox__form" onSubmit={event => {
        event.preventDefault();
        if (!title.trim() || !port.create) return;
        void mutate(signal => port.create!({title: title.trim(), summary: summary.trim()}, signal), '경험을 기록했습니다. AI 분석이나 주제 승인은 별도로 선택합니다.')
          .then(ok => { if (ok) { setTitle(''); setSummary(''); } });
      }}>
        <label htmlFor="experience-title">새 경험 제목</label>
        <input id="experience-title" maxLength={120} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} />
        <label htmlFor="experience-summary">내가 한 일 (최대 500자)</label>
        <textarea id="experience-summary" rows={3} maxLength={500} value={summary} onChange={event => setSummary(event.target.value)} disabled={busy} />
        <button type="submit" className="button" disabled={busy || !title.trim()}>내 경험 기록</button>
        <p className="muted">작성한 경험은 본인 기록입니다. 학점·과목명에서 역량을 추론하거나 학교에서 확인한 이수 사실로 바꾸지 않습니다.</p>
      </form>}
      {port.requestCandidates && view.cards.length > 0 && <fieldset className="exp-pick" disabled={busy}>
        <legend>AI 후보를 확인할 내 경험 선택 (최대 16개)</legend>
        {view.cards.map(card => <label className="exp-pick__opt" key={card.experienceId}>
          <input type="checkbox" checked={selected.includes(card.experienceId)} disabled={!card.canRequest || (!selected.includes(card.experienceId) && selectedCards.length >= 16)}
            onChange={() => { setSelected(ids => ids.includes(card.experienceId) ? ids.filter(id => id !== card.experienceId) : [...ids, card.experienceId]); setConsent(false); }} />
          {card.title}
        </label>)}
        <label className="exp-pick__opt"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
          선택한 경험의 AI 후보 분석을 요청합니다. 후보는 검토 전 확정되지 않으며, 실제 연결에서는 별도 동의·승인과 비용 조건을 확인합니다.
        </label>
        <p className="muted">합성 시연은 외부 모델을 호출하지 않습니다. 저장·삭제, 분석 요청, 추천 활용 승인은 각각 별도 선택입니다.</p>
        <div className="exp-pick__actions">
          <button type="button" className="button" disabled={!consent || selectedCards.length === 0} onClick={() => {
            const selection = selectedCards.map(c => ({experienceId: c.experienceId,
              contentVersion: c.expected.expectedContentVersion, consentVersion: c.expected.expectedConsentVersion}));
            void mutate(async signal => {
              const r = await port.requestCandidates!(selection, signal);
              return r;
            }, value => {
              const r = value as {ready: number; pending: number; unavailable: number};
              return `검토할 후보 ${r.ready}개 · 준비 중 ${r.pending}개 · 현재 실행할 수 없음 ${r.unavailable}개. 준비 중인 후보는 같은 요청으로 다시 확인할 수 있습니다.`;
            });
          }}>선택한 경험 AI 후보 요청</button>
          <button type="button" className="button button--quiet" onClick={() => { setSelected([]); setConsent(false); }}>선택 취소</button>
          <button type="button" className="button button--quiet" onClick={() => setRound(n => n + 1)}>최신 경험 다시 조회</button>
        </div>
      </fieldset>}
      <p role={shown?.alert ? 'alert' : 'status'} className={shown ? 'notice-box' : 'visually-hidden'}>{shown?.text ?? ''}</p>
      {view.cards.length === 0
        ? <p>아직 기록한 경험이 없습니다. 경험을 먼저 남기면 여기에서 주제를 고를 수 있습니다.</p>
        : view.cards.map(card => (
          <Card key={`${card.experienceId}:${card.expected.expectedApprovalVersion}:${card.expected.expectedContentVersion}:${card.expected.expectedConsentVersion}`}
            card={card} busy={busy}
            onApprove={(c, picked, manual) => {
              const input = approvalInput(c, picked, manual);
              if (input) void mutate(signal => port.approve(c.experienceId, input, signal), `「${c.title}」의 주제를 승인했습니다.`);
            }}
            onRevoke={c => void mutate(signal => port.revoke(c.experienceId, c.expected, signal), `「${c.title}」의 승인을 취소했습니다.`)}
            onRemove={port.remove ? c => void mutate(signal => port.remove!(c.experienceId, c.expected.expectedContentVersion, signal), '경험과 연결된 주제 승인을 삭제했습니다.') : undefined} />
        ))}
      <section aria-label="내가 선택할 다음 활동" className="notice-box">
        <h3>내가 선택할 다음 활동</h3>
        <p>관심 주제와 현재 승인한 경험은 다음 활동을 고를 때 참고할 수 있습니다. 이 화면의 일부 목록으로 전체 추천 순위를 다시 계산하지 않습니다.</p>
        <p>활동 기록 → 주제 확인·수정 → 원하는 기회 살펴보기 → 준비할 일 기록의 순서로 선택하세요. 능력 부족·합격 가능성·공식 이수 여부를 판정하는 로드맵은 아닙니다.</p>
        <p>미공유 학사 자료는 ‘공유하지 않음’, 근거가 없는 항목은 ‘미확인’이며 경험이나 학점 0으로 표시하지 않습니다.</p>
        {matching.length > 0 && <ul>{matching.map(o => <li key={o.id}>
          {navigate ? <InAppLink to={`/opportunities/${encodeURIComponent(o.id)}`} navigate={navigate}>{o.title}</InAppLink>
            : <a href={inAppHref(`/opportunities/${encodeURIComponent(o.id)}`)}>{o.title}</a>}
          <p className="muted">이 목록에서 승인한 주제와 연결: {o.topics.filter(t => approvedTopics.has(t)).map(t => approvedTopics.get(t)).join(' · ')}.
            현재 가상 학생에게 이미 표시된 합성 기회입니다. 지원 조건은 공고에서 따로 확인하세요.</p>
        </li>)}</ul>}
      </section>
      {view.partial && <p className="muted">경험이 더 있습니다. 이 목록은 일부이며 전체 주제 목록이 아닙니다.</p>}
    </section>
  );
}
