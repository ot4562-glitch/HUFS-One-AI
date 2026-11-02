import {useState} from 'react';
import type {BookmarkOutcome} from '@hufs-one/contracts';
import {googleSignInPath} from '../../integrations/api-client.js';
import {DDayText} from '../demo/DDayText.js';
import {RESULT_TEXT, SELF_REPORT_TEXT, type BoardCard} from './boardView.js';
import type {BoardApi} from './useApplicationBoard.js';

export const BOARD_NOTE = '단계는 내가 직접 기록하는 진행 상황이에요. 실제 지원 접수·합격 여부는 각 기관에서 확인해 주세요.';

function Status({ok}: {ok: boolean | null}) {
  if (ok === null) return null;
  return <span role="status" className="muted">{ok ? ' 저장했어요.' : ' 저장하지 못했어요. 위 안내를 확인해 주세요.'}</span>;
}

function ResultForm({card, board, onDone}: {card: BoardCard; board: BoardApi; onDone: (ok: boolean) => void}) {
  const [result, setResult] = useState<BookmarkOutcome['result'] | ''>('');
  const [note, setNote] = useState('');
  return (
    <form className="board__form" onSubmit={async e => {
      e.preventDefault();
      if (!result) return;
      const outcome: BookmarkOutcome = {provenance: 'USER_ENTERED_UNVERIFIED', result, ...(note.trim() ? {note: note.trim()} : {})};
      onDone(await board.advance(card.itemId, 'RESULT_RECORDED', outcome));
    }}>
      <label htmlFor={`result-${card.itemId}`}>결과 (내가 기록)</label>
      <select id={`result-${card.itemId}`} value={result} onChange={e => setResult(e.target.value as BookmarkOutcome['result'] | '')}>
        <option value="">선택하세요</option>
        {(Object.keys(RESULT_TEXT) as BookmarkOutcome['result'][]).map(r => <option key={r} value={r}>{RESULT_TEXT[r]}</option>)}
      </select>
      <label htmlFor={`note-${card.itemId}`}>메모 (선택, 최대 160자)</label>
      <input id={`note-${card.itemId}`} maxLength={160} value={note} onChange={e => setNote(e.target.value)} />
      <button type="submit" className="button" disabled={board.busy || !result}>결과 저장</button>
    </form>
  );
}

function Card({card, board}: {card: BoardCard; board: BoardApi}) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [task, setTask] = useState('');
  const [recording, setRecording] = useState(false);
  const titleId = `board-card-${card.itemId}`;
  return (
    <li className="board__card" aria-labelledby={titleId}>
      <h4 id={titleId} className="board__card-title">{card.title ?? '공고 정보를 불러올 수 없어요'}</h4>
      {card.title === null && <p className="muted board__small">공고가 바뀌거나 내려가도 내 기록은 지우지 않아요.</p>}
      <ul className="board__pills" aria-label="표시">
        {card.synthetic && <li className="pill">합성 공고</li>}
        {card.selfReported && <li className="pill pill--outline">{SELF_REPORT_TEXT}</li>}
      </ul>
      {card.deadlineText && (
        <p className="board__small">{card.deadlineText}{card.dday && <> · <DDayText dday={card.dday} /></>}</p>
      )}
      {card.outcomeText && <p className="board__small"><strong>결과:</strong> {card.outcomeText} <span className="muted">(내가 기록)</span></p>}

      {card.tasks.length > 0 && (
        <ul className="board__tasks" aria-label="할 일">
          {card.tasks.map(t => (
            <li key={t.itemId}>
              <label>
                <input type="checkbox" checked={t.done} disabled={board.busy}
                  onChange={async e => setOk(await board.setTaskDone(t.itemId, e.target.checked))} />
                <span className={t.done ? 'is-done' : undefined}>{t.task}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <form className="board__task-form" onSubmit={async e => {
        e.preventDefault();
        if (!task.trim()) return;
        const done = await board.addTask(card.itemId, task.trim());
        setOk(done);
        if (done) setTask('');
      }}>
        <label htmlFor={`task-${card.itemId}`} className="visually-hidden">할 일 추가</label>
        <input id={`task-${card.itemId}`} maxLength={160} placeholder="할 일 추가 (예: 자기소개서 초안)" value={task} onChange={e => setTask(e.target.value)} />
        <button type="submit" className="button button--quiet" disabled={board.busy || !task.trim()}>추가</button>
      </form>

      {card.next && card.next.stage !== 'RESULT_RECORDED' && (
        <button type="button" className="button board__next" disabled={board.busy}
          onClick={async () => setOk(await board.advance(card.itemId, card.next!.stage))}>
          {card.next.label}
        </button>
      )}
      {card.next?.stage === 'RESULT_RECORDED' && (recording
        ? <ResultForm card={card} board={board} onDone={done => { setOk(done); if (done) setRecording(false); }} />
        : <button type="button" className="button board__next" disabled={board.busy} onClick={() => setRecording(true)}>{card.next.label}</button>)}
      <Status ok={ok} />
    </li>
  );
}

/** #80 지원 현황 보드 for the signed-in BETA owner. */
export function ApplicationBoard({board}: {board: BoardApi}) {
  switch (board.status) {
    case 'LOADING':
      return <div className="skeleton" aria-busy="true" aria-label="지원 현황을 불러오는 중"><div /><div /><div /></div>;
    case 'SIGNED_OUT':
      return (
        <div className="board__notice card" role="alert">
          <p>로그인이 필요해요. 외대 메일 확인을 마친 베타 참여자만 자신의 지원 현황을 볼 수 있어요.</p>
          <a className="button" href={googleSignInPath('BETA')}>Google로 로그인</a>
        </div>
      );
    case 'FORBIDDEN':
      return (
        <div className="board__notice card" role="alert">
          <p>지원 현황 보드는 베타 참여자 본인 기록 전용이에요.</p>
          <p className="muted">심사용 합성 시연에서는 보관함의 저장·모의 지원을 이용해 주세요.</p>
        </div>
      );
    case 'CONFLICT':
    case 'UNAVAILABLE':
      return (
        <div className="board__notice card" role="alert">
          <p>{board.status === 'CONFLICT' ? '다른 창이나 기기에서 기록이 바뀌었어요. 최신 내용으로 다시 불러와 주세요.' : '지금은 지원 현황을 불러올 수 없어요.'}</p>
          <button type="button" className="button" onClick={board.reload}>다시 불러오기</button>
        </div>
      );
    case 'READY':
      break;
  }
  const total = board.columns.reduce((n, c) => n + c.cards.length, 0);
  return (
    // Remount on every scope change so unsaved task text or an open result form never carries over.
    <div key={board.scope} className="board">
      <p className="board__note" role="note">{BOARD_NOTE}</p>
      {total === 0
        ? <p className="muted card">아직 보관함에 저장한 공고가 없어요. 저장한 공고는 여기에 ‘관심’으로 보여요.</p>
        : (
          <div className="board__columns">
            {board.columns.map(col => (
              <section key={col.stage} className="board__col" aria-labelledby={`col-${col.stage}`}>
                <h3 id={`col-${col.stage}`} className="board__col-title">{col.title} <span className="count" aria-label={`${col.cards.length}건`}>{col.cards.length}</span></h3>
                {col.cards.length
                  ? <ul className="board__cards">{col.cards.map(c => <Card key={c.itemId} card={c} board={board} />)}</ul>
                  : <p className="muted board__small">없음</p>}
              </section>
            ))}
          </div>
        )}
    </div>
  );
}
