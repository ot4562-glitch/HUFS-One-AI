import {useState} from 'react';
import {TOPIC_CODES, type TopicCode} from '@hufs-one/contracts';
import {TOPIC_TEXT} from '../demo/topicText.js';
import {nextExperienceId} from './sandboxState.js';
import type {SandboxApi} from './useSandbox.js';

export const SANDBOX_NOTE = '심사용 합성 시연 — 실제로 저장·제출되지 않습니다.';
export const NOT_REVIEWER_TEXT = '이 기능은 심사용 합성 시연에서 먼저 제공됩니다. 개인 저장 기능은 준비 중입니다.';

export function SandboxNote() {
  return <p className="sandbox-note" role="note">{SANDBOX_NOTE}</p>;
}

function Status({ok}: {ok: boolean | null}) {
  if (ok === null) return null;
  return <span role="status" className="muted">{ok ? ' 반영했습니다.' : ' 반영하지 못했습니다. 화면 위 안내를 확인해 주세요.'}</span>;
}

// Each control remounts when sandbox.scope changes (subject, context, epoch or snapshot), so an unsaved
// draft, note, interest pick, reset confirmation or status line is dropped instead of reaching the next scope.

/** 저장·지원서 초안·모의 지원 on an opportunity detail. */
export function OpportunityActions({sandbox, id}: {sandbox: SandboxApi; id: string}) {
  return <OpportunityActionsIn key={`${sandbox.scope}:${id}`} sandbox={sandbox} id={id} />;
}
function OpportunityActionsIn({sandbox, id}: {sandbox: SandboxApi; id: string}) {
  const saved = sandbox.state.bookmarks.has(id);
  const simulated = sandbox.state.simulated.has(id);
  const [draft, setDraft] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  if (!sandbox.ready) return <p className="muted" aria-busy="true">시연 기록을 불러오는 중</p>;
  const text = draft ?? sandbox.state.drafts.get(id) ?? '';
  const run = async (p: Promise<boolean>) => setOk(await p);
  return (
    <section className="section sandbox" aria-label="시연 동작">
      <SandboxNote />
      <div className="sandbox__row">
        {sandbox.can('BOOKMARK') && (
          <button type="button" className="button button--quiet" aria-pressed={saved} disabled={sandbox.busy}
            onClick={() => void run(sandbox.save({kind: 'BOOKMARK', itemId: id, saved: !saved}))}>
            {saved ? '보관함에서 빼기' : '보관함에 저장'}
          </button>
        )}
        {sandbox.can('SIMULATE_APPLICATION') && (
          simulated
            ? <span className="badge">모의 지원 완료(실제 제출 아님)</span>
            : <button type="button" className="button" disabled={sandbox.busy}
              onClick={() => void run(sandbox.save({kind: 'SIMULATE_APPLICATION', opportunityId: id}))}>모의 지원하기</button>
        )}
        <Status ok={ok} />
      </div>
      {sandbox.can('APPLICATION_DRAFT') && (
        <form className="sandbox__form" onSubmit={e => { e.preventDefault(); void run(sandbox.save({kind: 'APPLICATION_DRAFT', opportunityId: id, text})); }}>
          <label htmlFor={`draft-${id}`}>지원서 초안 (최대 1,200자)</label>
          <textarea id={`draft-${id}`} rows={5} maxLength={1200} value={text} onChange={e => setDraft(e.target.value)} />
          <button type="submit" className="button button--quiet" disabled={sandbox.busy}>초안 저장</button>
        </form>
      )}
    </section>
  );
}

/** 읽음 표시 on a notice detail. */
export function NoticeReadToggle({sandbox, id}: {sandbox: SandboxApi; id: string}) {
  return <NoticeReadToggleIn key={`${sandbox.scope}:${id}`} sandbox={sandbox} id={id} />;
}
function NoticeReadToggleIn({sandbox, id}: {sandbox: SandboxApi; id: string}) {
  const [ok, setOk] = useState<boolean | null>(null);
  if (!sandbox.ready || !sandbox.can('MARK_READ')) return null;
  const read = sandbox.state.read.has(id);
  return (
    <p>
      <button type="button" className="button button--quiet" aria-pressed={read} disabled={sandbox.busy}
        onClick={async () => setOk(await sandbox.save({kind: 'MARK_READ', itemId: id, read: !read}))}>
        {read ? '읽지 않음으로 표시' : '읽음으로 표시'}
      </button>
      <Status ok={ok} />
    </p>
  );
}

/** 경험: short notes (title line + description), saved in the sandbox only. */
export function ExperienceEditor({sandbox}: {sandbox: SandboxApi}) {
  return <ExperienceEditorIn key={sandbox.scope} sandbox={sandbox} />;
}
function ExperienceEditorIn({sandbox}: {sandbox: SandboxApi}) {
  const [note, setNote] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  if (!sandbox.ready) return <p className="muted" aria-busy="true">시연 기록을 불러오는 중</p>;
  const items = [...sandbox.state.experiences.entries()].filter(([, n]) => n.trim() !== '');
  return (
    <>
      <SandboxNote />
      {items.length
        ? <ul className="rows">{items.map(([id, n]) => <li key={id} className="row"><div className="row__link"><span className="row__title">{n.split('\n')[0]}</span>{n.includes('\n') && <span className="row__meta">{n.split('\n').slice(1).join(' ')}</span>}</div></li>)}</ul>
        : <p className="muted">아직 기록한 경험이 없어요. 제목 한 줄부터 남겨 보세요.</p>}
      {sandbox.can('EXPERIENCE') && (
        <form className="sandbox__form" onSubmit={async e => {
          e.preventDefault();
          if (!note.trim()) return;
          const done = await sandbox.save({kind: 'EXPERIENCE', experienceId: nextExperienceId(sandbox.state), note: note.trim()});
          setOk(done);
          if (done) setNote('');
        }}>
          <label htmlFor="exp-note">새 경험 (첫 줄은 제목, 최대 280자)</label>
          <textarea id="exp-note" rows={3} maxLength={280} value={note} onChange={e => setNote(e.target.value)} />
          <button type="submit" className="button" disabled={sandbox.busy || !note.trim()}>경험 저장</button>
          <Status ok={ok} />
        </form>
      )}
    </>
  );
}

/** 설정: interests (≤5 TopicCodes), notifications, sandbox reset. */
export function SandboxSettings({sandbox}: {sandbox: SandboxApi}) {
  return <SandboxSettingsIn key={sandbox.scope} sandbox={sandbox} />;
}
function SandboxSettingsIn({sandbox}: {sandbox: SandboxApi}) {
  const [picked, setPicked] = useState<TopicCode[] | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  if (!sandbox.ready) return <p className="muted" aria-busy="true">시연 기록을 불러오는 중</p>;
  const interests = picked ?? [...(sandbox.state.interests ?? [])];
  const toggleTopic = (t: TopicCode) =>
    setPicked(interests.includes(t) ? interests.filter(x => x !== t) : interests.length < 5 ? [...interests, t] : interests);
  return (
    <>
      <SandboxNote />
      {sandbox.can('SET_INTERESTS') && (
        <form className="sandbox__form" onSubmit={async e => { e.preventDefault(); setOk(await sandbox.save({kind: 'SET_INTERESTS', topics: interests})); setPicked(null); }}>
          <fieldset className="topics">
            <legend>관심 분야 (최대 5개, {interests.length}개 선택)</legend>
            {TOPIC_CODES.map(t => (
              <label key={t} className="topic">
                <input type="checkbox" checked={interests.includes(t)} disabled={!interests.includes(t) && interests.length >= 5} onChange={() => toggleTopic(t)} />
                {TOPIC_TEXT[t]}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="button" disabled={sandbox.busy}>관심 분야 저장</button>
        </form>
      )}
      {sandbox.can('SET_NOTIFICATIONS') && (
        <p>
          <label className="topic">
            <input type="checkbox" checked={sandbox.state.notifications === true} disabled={sandbox.busy}
              onChange={async e => setOk(await sandbox.save({kind: 'SET_NOTIFICATIONS', enabled: e.target.checked}))} />
            마감 알림 받기 (시연에서는 실제 알림이 가지 않습니다)
          </label>
        </p>
      )}
      {sandbox.can('RESET_SANDBOX') && (
        confirmReset
          ? <p role="alert">시연 기록을 모두 지울까요?{' '}
            <button type="button" className="button" onClick={async () => { setConfirmReset(false); setOk(await sandbox.save({kind: 'RESET_SANDBOX'})); }}>모두 지우기</button>{' '}
            <button type="button" className="button button--quiet" onClick={() => setConfirmReset(false)}>취소</button></p>
          : <p><button type="button" className="button button--quiet" onClick={() => setConfirmReset(true)}>시연 기록 초기화</button></p>
      )}
      <Status ok={ok} />
    </>
  );
}
