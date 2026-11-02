import {useEffect, useRef, useState} from 'react';
import {TOPIC_CODES, type DemoOverlayResult, type DemoOverlayValue, type DemoSnapshot, type TopicCode} from '@hufs-one/contracts';
import type {DemoController, DemoViewState} from '../../app/index.js';
import {TOPIC_TEXT} from '../demo/topicText.js';
import {compareFeeds, type FeedDiff, type OverlayPort} from './overlayCompare.js';

const asOfFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

interface Props {
  readonly controller: DemoController;
  readonly state: DemoViewState;
  readonly port: OverlayPort;
}

interface Change {
  readonly diff: FeedDiff;
  /** The value before this change, restored by 되돌리기 as a NEW CAS write. */
  readonly previous: DemoOverlayValue;
  /** Shown only while this exact snapshot is current. */
  readonly snapshot: DemoSnapshot;
}

function TopicPicker({legend, max, value, onChange}: {legend: string; max: number; value: readonly TopicCode[]; onChange: (v: TopicCode[]) => void}) {
  return (
    <fieldset className="topics">
      <legend>{legend} (최대 {max}개, {value.length}개 선택)</legend>
      {TOPIC_CODES.map(t => (
        <label key={t} className="topic">
          <input type="checkbox" checked={value.includes(t)} disabled={!value.includes(t) && value.length >= max}
            onChange={() => onChange(value.includes(t) ? value.filter(x => x !== t) : [...value, t])} />
          {TOPIC_TEXT[t]}
        </label>
      ))}
    </fieldset>
  );
}

function DiffView({diff}: {diff: FeedDiff}) {
  const row = (c: {id: string; title: string; needsCheck: boolean}) => <>{c.title}{c.needsCheck && <span className="muted"> · 자격 확인 필요</span>}</>;
  return (
    <section className="board__col compare" aria-labelledby="compare-title">
      <h3 id="compare-title" className="board__col-title">바꾸기 전과 후</h3>
      <p className="board__small">같은 기준 시각 {asOfFmt.format(Date.parse(diff.asOf))} · 설정 버전 {diff.overlayBefore} → {diff.overlayAfter}</p>
      <p className="board__small">더 좋아졌다는 뜻이 아니라, 같은 시점의 결과가 어떻게 바뀌었는지만 보여 줘요.</p>
      <h4>새로 큰 카드가 된 공고 ({diff.added.length})</h4>
      {diff.added.length ? <ul>{diff.added.map(c => (
        <li key={c.id}>{row(c)}{c.reasons.length > 0 && <ul className="card__reasons">{c.reasons.map(r => <li key={r}>{r}</li>)}</ul>}</li>
      ))}</ul> : <p className="muted board__small">없음</p>}
      <h4>큰 카드에서 빠진 공고 ({diff.removed.length})</h4>
      {diff.removed.length ? <ul>{diff.removed.map(c => <li key={c.id}>{row(c)} <span className="muted">— {c.whereText}</span></li>)}</ul> : <p className="muted board__small">없음</p>}
      <h4>그대로인 큰 카드 ({diff.kept.length})</h4>
      {diff.kept.length ? <ul>{diff.kept.map(c => <li key={c.id}>{row(c)}</li>)}</ul> : <p className="muted board__small">없음</p>}
      <p className="board__small">작은 목록 {diff.compactBefore}개 → {diff.compactAfter}개</p>
    </section>
  );
}

/**
 * #85 BETA: change interests/desired jobs as a temporary overlay, see the same-asOf before/after of the
 * feed, and undo with a new CAS write. Every call goes through DemoController.runOverlayOperation, so a
 * 401/403/409, a subject switch or a late response clears instead of showing a stale comparison.
 */
export function OverlaySettings({controller, state, port}: Props) {
  const snapshot = state.status === 'READY' ? state.snapshot : null;
  const [current, setCurrent] = useState<DemoOverlayResult | null>(null);
  const [interests, setInterests] = useState<TopicCode[]>([]);
  const [jobs, setJobs] = useState<TopicCode[]>([]);
  const [change, setChange] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<boolean | null>(null);
  // While our own write is in flight its new snapshot arrives before `current` is updated; that is not
  // staleness and must not trigger a reload (a reload would replace the snapshot again).
  const writing = useRef(false);
  const contextId = state.status === 'READY' ? state.context?.contextId ?? null : null;
  // The loaded overlay belongs to the snapshot it produced; any other snapshot (another write, revalidation,
  // subject) means it is stale until reloaded. Reload only then: a get also replaces the snapshot.
  const fresh = current !== null && snapshot !== null && current.snapshot === snapshot;

  useEffect(() => {
    if (!contextId || fresh || writing.current) return;
    // No "live" flag: runOverlayOperation already returns null for any other epoch/context, and StrictMode's
    // second run is refused while the first get is in flight — dropping the first result would hang here.
    void controller.runOverlayOperation((ctx, s) => port.get(ctx, s)).then(r => {
      if (!r) return;
      setCurrent(r);
      setInterests([...(r.overlay.value.interestTopics ?? [])]);
      setJobs([...(r.overlay.value.desiredJobTopics ?? [])]);
    });
  }, [controller, port, contextId, fresh]);

  if (!snapshot) return null;
  const shownChange = change && change.snapshot === snapshot ? change : null;

  const run = async (write: (version: number, before: DemoSnapshot) => (ctx: Parameters<OverlayPort['get']>[0], s: AbortSignal) => Promise<DemoOverlayResult>, previous: DemoOverlayValue) => {
    if (!current || !fresh || busy) return;
    const before = snapshot;
    setBusy(true);
    writing.current = true;
    try {
      const r = await controller.runOverlayOperation(write(current.overlay.version, before));
      setOk(r !== null);
      if (!r) return; // denied, conflicted or stale: the status banner explains, nothing old stays
      setCurrent(r);
      setInterests([...(r.overlay.value.interestTopics ?? [])]);
      setJobs([...(r.overlay.value.desiredJobTopics ?? [])]);
      const diff = compareFeeds(before, r.snapshot);
      setChange(diff ? {diff, previous, snapshot: r.snapshot} : null);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  const nextValue = (): DemoOverlayValue => {
    const keep = current?.overlay.value ?? {};
    return {
      ...(keep.hiddenOpportunityIds ? {hiddenOpportunityIds: keep.hiddenOpportunityIds} : {}),
      ...(interests.length ? {interestTopics: interests} : {}),
      ...(jobs.length ? {desiredJobTopics: jobs} : {}),
    };
  };

  return (
    <section className="section" aria-labelledby="overlay-title">
      <h2 id="overlay-title" className="section__title">맞춤 설정 바꿔 보기</h2>
      <p className="board__note" role="note">관심 분야·희망 직무를 잠시 바꿔 맞춤 공고가 어떻게 달라지는지 확인해요. 원래 프로필·동의는 바뀌지 않고, 언제든 되돌릴 수 있어요.</p>
      {!fresh ? <div className="skeleton" aria-busy="true" aria-label="현재 설정을 불러오는 중"><div /></div> : (
        <form className="sandbox__form" onSubmit={e => { e.preventDefault(); void run(v => (ctx, s) => port.set(ctx, {expectedVersion: v, value: nextValue()}, s), current!.overlay.value); }}>
          <p className="board__small">선택하지 않은 항목은 원래 프로필 설정을 그대로 써요. 현재 설정 버전 {current!.overlay.version}.</p>
          <TopicPicker legend="관심 분야" max={5} value={interests} onChange={setInterests} />
          <TopicPicker legend="희망 직무" max={3} value={jobs} onChange={setJobs} />
          <div className="sandbox__row">
            <button type="submit" className="button" disabled={busy}>바꿔서 비교하기</button>
            {Object.keys(current!.overlay.value).length > 0 && (
              <button type="button" className="button button--quiet" disabled={busy}
                onClick={() => void run(v => (ctx, s) => port.reset(ctx, v, s), current!.overlay.value)}>원래 설정으로</button>
            )}
          </div>
          {ok === false && <p role="status" className="muted">반영하지 못했어요. 위 안내를 확인해 주세요.</p>}
        </form>
      )}
      {shownChange && (
        <>
          <DiffView diff={shownChange.diff} />
          <p>
            <button type="button" className="button button--quiet" disabled={busy || !fresh}
              onClick={() => {
                const prev = shownChange.previous;
                void run(v => (ctx, s) => Object.keys(prev).length ? port.set(ctx, {expectedVersion: v, value: prev}, s) : port.reset(ctx, v, s), current!.overlay.value);
              }}>되돌리기</button>
          </p>
        </>
      )}
    </section>
  );
}
