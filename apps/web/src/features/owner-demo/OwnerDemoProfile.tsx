import {useEffect, useState, useSyncExternalStore, type FormEvent} from 'react';
import {
  DemoProfileSaveSchema, TOPIC_CODES, type DemoProfileSave, type DemoProfileReset,
  type DemoProfileResponse, type DemoProfileValue, type TopicCode,
} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {TOPIC_TEXT} from '../demo/topicText.js';

/** Owner-only BETA port. Never accepts a S01–S05 alias or a REVIEWER actor. */
export interface OwnerDemoProfilePort {
  readonly session: OwnerSessionController;
  read(signal?: AbortSignal): Promise<DemoProfileResponse>;
  save(change: DemoProfileSave, signal?: AbortSignal): Promise<DemoProfileResponse>;
  reset(change: DemoProfileReset, signal?: AbortSignal): Promise<DemoProfileResponse>;
}
type Draft = {
  major: string;
  credits: string;
  topics: TopicCode[];
  doubleKind: 'UNSET' | 'NONE' | 'DOUBLE';
  doubleName: string;
};
function draftFrom(value: DemoProfileValue): Draft {
  return {
    major: value.primaryMajor ?? '',
    credits: value.earnedCreditUnits === null ? '' : String(value.earnedCreditUnits / 2),
    topics: [...value.interestTopics],
    doubleKind: value.doubleMajor === null ? 'UNSET' : value.doubleMajor.kind,
    doubleName: value.doubleMajor?.kind === 'DOUBLE' ? value.doubleMajor.major : '',
  };
}
function toSave(version: number, draft: Draft): DemoProfileSave | null {
  // A blank credit input is UNKNOWN, while the literal 0 is a verified input value
  // within this synthetic namespace (not a claim about an actual transcript).
  const credits = draft.credits.trim() === '' ? null : Number(draft.credits);
  const units = credits !== null && Number.isFinite(credits)
    && Number.isSafeInteger(credits * 2) ? credits * 2 : null;
  const doubleMajor = draft.doubleKind === 'UNSET' ? null
    : draft.doubleKind === 'NONE' ? {kind: 'NONE' as const}
      : {kind: 'DOUBLE' as const, major: draft.doubleName.trim()};
  const parsed = DemoProfileSaveSchema.safeParse({
    expectedVersion: version,
    value: {
      primaryMajor: draft.major.trim() || null,
      earnedCreditUnits: units,
      interestTopics: draft.topics,
      doubleMajor,
    },
  });
  return parsed.success ? parsed.data : null;
}

/** BETA owner profile independent of the five public demo subjects and local workbench.
 * The current actor is checked before and after every HTTP operation. Any session,
 * source, version or permission failure drops the prior profile and snapshot.
 */
export function OwnerDemoProfile({port}: {port: OwnerDemoProfilePort}) {
  const session = useSyncExternalStore(port.session.subscribe, port.session.getState, port.session.getState);
  const [loaded, setLoaded] = useState<DemoProfileResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => { void port.session.initialize(); }, [port]);
  useEffect(() => {
    setLoaded(null); setDraft(null); setConfirmReset(false); setNotice('');
    if (session.status !== 'READY') return;
    let active = true;
    void port.session.runLatest('EMPTY_DEMO', signal => port.read(signal)).then(result => {
      if (!active || !result) return;
      setLoaded(result); setDraft(draftFrom(result.profile.value));
    });
    return () => { active = false; };
  }, [port, session.epoch, session.status]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!loaded || !draft || busy || session.status !== 'READY') return;
    const input = toSave(loaded.profile.version, draft);
    if (!input) { setNotice('네 가지 설정을 모두 입력해 주세요. 학점은 0.5 단위, 관심 분야는 1개 이상이어야 합니다.'); return; }
    setBusy(true); setNotice('');
    try {
      const next = await port.session.runMutation(signal => port.save(input, signal));
      if (next && port.session.getState().status === 'READY') {
        setLoaded(next); setDraft(draftFrom(next.profile.value)); setNotice('합성 설정과 재계산 결과를 저장했습니다.');
      }
    } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!loaded || busy || session.status !== 'READY') return;
    setBusy(true); setConfirmReset(false); setNotice('');
    try {
      const next = await port.session.runMutation(signal => port.reset({expectedVersion: loaded.profile.version}, signal));
      if (next && port.session.getState().status === 'READY') {
        setLoaded(next); setDraft(draftFrom(next.profile.value)); setNotice('네 가지 설정을 모두 초기화했습니다.');
      }
    } finally { setBusy(false); }
  };

  if (session.status === 'IDLE' || session.status === 'CHECKING') {
    return <p aria-busy="true">현재 사용자 권한을 확인하고 있어요.</p>;
  }
  if (session.status !== 'READY') {
    return <p role="alert">본인 인증·권한 또는 서버 연결을 확인할 수 없습니다. 다른 학생의 이전 설정은 표시하지 않았어요. 다시 로그인한 후 새로고침해 주세요.</p>;
  }
  if (!loaded || !draft) return <p aria-busy="true">별도 합성 계정 설정을 불러오는 중이에요.</p>;
  const candidate = toSave(loaded.profile.version, draft);
  const edit = (next: Partial<Draft>) => { setDraft(previous => previous ? {...previous, ...next} : null); setNotice(''); };

  return (
    <section aria-label="독립 빈 시연 계정" className="local-account__panel">
      <p role="note">이 계정은 별도 EMPTY_DEMO 합성 계정입니다. 학교 공식 계정·학점 원장·S01–S05 시연 대상·REVIEWER와 연결되지 않습니다. 졸업·지원 가능 여부의 공식 판정이 아닙니다.</p>
      <p>프로필 버전 {loaded.profile.version} · 계산 시점 {loaded.snapshot.asOf}</p>
      <form onSubmit={event => { void save(event); }} aria-label="별도 시연 프로필 설정">
        <label>주전공<input value={draft.major} maxLength={40} onChange={e => edit({major: e.target.value})} /></label>
        <label>취득 학점 (0~250, 0.5 단위)
          <input type="number" min={0} max={250} step={0.5} value={draft.credits}
            onChange={e => edit({credits: e.target.value})} />
        </label>
        <fieldset>
          <legend>관심 분야 (1~5개)</legend>
          {TOPIC_CODES.map(topic => <label key={topic}>
            <input type="checkbox" checked={draft.topics.includes(topic)}
              disabled={!draft.topics.includes(topic) && draft.topics.length >= 5}
              onChange={e => edit({topics: e.target.checked
                ? [...draft.topics, topic] : draft.topics.filter(t => t !== topic)})} />
            {TOPIC_TEXT[topic]}
          </label>)}
        </fieldset>
        <label>이중전공 상태
          <select value={draft.doubleKind} onChange={e => edit({
            doubleKind: e.target.value as Draft['doubleKind'], doubleName: '',
          })}>
            <option value="UNSET">미정 · UNSET</option>
            <option value="NONE">없음 · NONE</option>
            <option value="DOUBLE">선택함 · DOUBLE</option>
          </select>
        </label>
        {draft.doubleKind === 'DOUBLE' && <label>이중전공명
          <input value={draft.doubleName} maxLength={40} onChange={e => edit({doubleName: e.target.value})} />
        </label>}
        <button type="submit" disabled={busy || !candidate}>프로필 저장·재계산</button>
      </form>
      {!confirmReset ? <button type="button" disabled={busy} onClick={() => setConfirmReset(true)}>
        네 가지 설정 초기화
      </button> : <div role="group" aria-label="프로필 초기화 확인">
        <p>저장된 프로필의 네 가지 설정을 모두 비웁니다. 이 작업은 되돌릴 수 없습니다.</p>
        <button type="button" disabled={busy} onClick={() => { void reset(); }}>초기화 확인</button>
        <button type="button" disabled={busy} onClick={() => setConfirmReset(false)}>취소</button>
      </div>}
      {notice && <p role="status">{notice}</p>}
      <section aria-label="합성 재계산 결과">
        <h2>개인화 재계산 (합성)</h2>
        <p>추천 카드 {loaded.snapshot.feed.featured.length}건 · 공지 {loaded.snapshot.notices.items.length}건 ·
          가상 동아리 {loaded.snapshot.clubs.all.length}건</p>
        <ul>{loaded.snapshot.feed.featured.map(card =>
          <li key={card.opportunityId}>{card.title}</li>)}</ul>
        <p>학업·개설 전망: 근거 부족 · 확인 필요 (실제 학업 판정 없음)</p>
      </section>
    </section>
  );
}
