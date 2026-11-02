import {useEffect, useRef, useState} from 'react';
import {DEFAULT_ERROR_MESSAGES, TOPIC_CODES, type ApiErrorCode} from '@hufs-one/contracts';
import {HufsApiError} from '../../integrations/api-client.js';
import {TOPIC_TEXT} from '../demo/topicText.js';
import {
  DemoProfileRecordSchema, draftOf, isBlank, missingFields, validateDraft,
  type DemoProfilePort, type DemoProfileRecord, type FieldErrors, type ProfileDraft,
} from './demoProfile.js';
import {creditsText} from '../graduation/graduationView.js';

type Load =
  | {readonly kind: 'LOADING'}
  | {readonly kind: 'READY'; readonly record: DemoProfileRecord}
  | {readonly kind: 'FAILED'; readonly code: ApiErrorCode};

const codeOf = (e: unknown): ApiErrorCode => e instanceof HufsApiError ? e.code : 'PROVIDER_UNAVAILABLE';

/**
 * #132 blank demo account: 주전공 · 취득 학점 · 관심 분야 · 이중전공 여부. Every request carries its own
 * AbortController; anything that settles after unmount or after a newer request is ignored.
 * The record shown always comes from the port (server), never from what was typed.
 */
export function DemoProfileSettings({port}: {port: DemoProfilePort}) {
  const [load, setLoad] = useState<Load>({kind: 'LOADING'});
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const current = useRef<AbortController | null>(null);

  const run = (task: (signal: AbortSignal) => Promise<unknown>, after: (r: DemoProfileRecord) => string | null) => {
    current.current?.abort();
    const abort = new AbortController();
    current.current = abort;
    setBusy(true);
    setNotice(null);
    task(abort.signal).then(raw => {
      if (abort.signal.aborted) return;
      const parsed = DemoProfileRecordSchema.safeParse(raw);
      if (!parsed.success) { setLoad({kind: 'FAILED', code: 'PROVIDER_UNAVAILABLE'}); return; }
      setLoad({kind: 'READY', record: parsed.data});
      setDraft(null);
      setErrors({});
      setNotice(after(parsed.data));
    }, e => {
      if (abort.signal.aborted) return;
      const code = codeOf(e);
      if (code === 'VERSION_CONFLICT') setNotice('다른 탭에서 먼저 바뀌었어요. 최신 설정을 불러온 뒤 다시 저장해 주세요.');
      else setLoad({kind: 'FAILED', code});
    }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
  };

  const reload = () => run(s => port.get(s), () => null);
  useEffect(() => {
    reload();
    return () => current.current?.abort();
  }, [port]); // reload only depends on port

  if (load.kind === 'LOADING') return <p className="muted" aria-busy="true">시연 계정 설정을 불러오는 중</p>;
  if (load.kind === 'FAILED') {
    return (
      <div className="banner banner--warn" role="alert">
        <p>{DEFAULT_ERROR_MESSAGES[load.code]} 저장된 설정을 확인할 수 없어 표시하지 않았습니다.</p>
        {load.code !== 'UNAUTHENTICATED' && load.code !== 'FORBIDDEN' &&
          <button type="button" className="button" onClick={reload}>다시 불러오기</button>}
      </div>
    );
  }

  const {record} = load;
  const form = draft ?? draftOf(record.value);
  const set = (patch: Partial<ProfileDraft>) => { setDraft({...form, ...patch}); setNotice(null); };
  const missing = missingFields(record.value);
  const save = () => {
    const v = validateDraft(form);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({});
    run(s => port.save(record.version, v.value, s), () => '저장했습니다.');
  };
  const err = (k: keyof FieldErrors) => errors[k] ? <span id={`err-${k}`} className="field-error">{errors[k]}</span> : null;
  const described = (k: keyof FieldErrors) => errors[k] ? {'aria-invalid': true, 'aria-describedby': `err-${k}`} as const : {};

  return (
    <section className="section profile" aria-labelledby="profile-title">
      <h2 id="profile-title">시연 계정 설정</h2>
      <p className="sandbox-note" role="note">
        팀원 계정·S01~S05와 분리된 <strong>빈 시연 계정</strong>입니다. 합성 시연 전용이며 실제 학생 정보가 아닙니다.
        학점은 취득 학점이며 성적(평점)이나 공식 이수 확인이 아닙니다.
      </p>
      <p role="status">
        {isBlank(record.value) ? '아직 아무것도 설정하지 않았어요. 개인화에는 설정이 필요합니다.'
          : missing.length ? `설정 필요: ${missing.join(', ')}`
          : `저장된 설정 · 주전공 ${record.value.primaryMajor} · 취득 ${creditsText(record.value.earnedCreditUnits ?? 0)}`}
      </p>
      <p className="muted">저장한 설정을 추천·공지·동아리 결과에 다시 계산해 반영하는 서버 연결은 아직 준비 중입니다(#132 계약 대기). 지금은 설정 저장·취소·초기화만 동작합니다.</p>

      <form className="sandbox__form profile__form" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
        <label htmlFor="pf-major">주전공 (필수)</label>
        <input id="pf-major" type="text" maxLength={40} value={form.primaryMajor} {...described('primaryMajor')}
          onChange={e => set({primaryMajor: e.target.value})} />
        {err('primaryMajor')}

        <label htmlFor="pf-credits">취득 학점 (필수, 0 이상 · 0.5 단위 · 없으면 0)</label>
        <input id="pf-credits" type="text" inputMode="decimal" value={form.credits} {...described('credits')}
          onChange={e => set({credits: e.target.value})} />
        {err('credits')}

        <fieldset className="topics" {...described('interestTopics')}>
          <legend>내 관심 분야 (필수, 최대 5개, {form.interestTopics.length}개 선택)</legend>
          {TOPIC_CODES.map(t => (
            <label key={t} className="topic">
              <input type="checkbox" checked={form.interestTopics.includes(t)}
                disabled={!form.interestTopics.includes(t) && form.interestTopics.length >= 5}
                onChange={() => set({interestTopics: form.interestTopics.includes(t)
                  ? form.interestTopics.filter(x => x !== t) : [...form.interestTopics, t]})} />
              {TOPIC_TEXT[t]}
            </label>
          ))}
        </fieldset>
        {err('interestTopics')}

        <fieldset className="profile__double" {...described('doubleMajorKind')}>
          <legend>이중전공 (필수)</legend>
          <label className="topic"><input type="radio" name="pf-double" checked={form.doubleMajorKind === 'NONE'}
            onChange={() => set({doubleMajorKind: 'NONE'})} /> 없음</label>
          <label className="topic"><input type="radio" name="pf-double" checked={form.doubleMajorKind === 'DOUBLE'}
            onChange={() => set({doubleMajorKind: 'DOUBLE'})} /> 있음</label>
        </fieldset>
        {err('doubleMajorKind')}
        {form.doubleMajorKind === 'DOUBLE' && (
          <>
            <label htmlFor="pf-double-major">이중전공 학과 (필수)</label>
            <input id="pf-double-major" type="text" maxLength={40} value={form.doubleMajor} {...described('doubleMajor')}
              onChange={e => set({doubleMajor: e.target.value})} />
            {err('doubleMajor')}
          </>
        )}

        <div className="sandbox__row">
          <button type="submit" className="button" disabled={busy}>{busy ? '저장하는 중' : '저장'}</button>
          <button type="button" className="button button--quiet" disabled={busy || draft === null}
            onClick={() => { setDraft(null); setErrors({}); setNotice('입력을 취소하고 저장된 설정으로 돌렸습니다.'); }}>취소</button>
        </div>
      </form>

      {notice && (
        <p role="status" className="muted">{notice}{' '}
          {notice.startsWith('다른 탭') && <button type="button" className="button button--quiet" onClick={reload}>최신 설정 불러오기</button>}
        </p>
      )}

      {confirmReset
        ? <div role="alert" className="banner banner--warn">
            <p>이 시연 계정의 설정과 시연 기록을 모두 지우고 처음(빈 상태)으로 돌릴까요? 다른 계정과 S01~S05는 바뀌지 않습니다.</p>
            <div className="sandbox__row">
              <button type="button" className="button" disabled={busy}
                onClick={() => { setConfirmReset(false); run(s => port.reset(record.version, s), () => '시연 계정을 초기화했습니다.'); }}>초기화</button>
              <button type="button" className="button button--quiet" onClick={() => setConfirmReset(false)}>취소</button>
            </div>
          </div>
        : <p><button type="button" className="button button--quiet" disabled={busy} onClick={() => setConfirmReset(true)}>시연 계정 초기화</button></p>}
    </section>
  );
}
