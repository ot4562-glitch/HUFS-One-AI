import {useEffect, useRef, useState} from 'react';
import {DEFAULT_ERROR_MESSAGES, type ApiErrorCode} from '@hufs-one/contracts';
import {HufsApiError, googleSignInPath} from '../../integrations/api-client.js';
import {accessEndText, type InviteCodeHolder, type InvitePort} from './invite.js';

type Step =
  | {readonly kind: 'CHECKING'}
  | {readonly kind: 'NO_CODE'}
  | {readonly kind: 'NEED_SIGN_IN'}
  | {readonly kind: 'READY'}
  | {readonly kind: 'REDEEMING'}
  | {readonly kind: 'DONE'; readonly endsAt: string}
  | {readonly kind: 'FAILED'; readonly code: ApiErrorCode};

const FAILURE_TEXT: Partial<Record<ApiErrorCode, string>> = {
  FORBIDDEN: '초대가 만료되었거나 중단되었습니다. 초대장을 보낸 곳에 문의해 주세요.',
  INVALID_INPUT: '초대 코드 형식이 올바르지 않습니다. 받은 초대 링크를 그대로 다시 열어 주세요.',
  VERSION_CONFLICT: '초대 상태가 바뀌었습니다. 초대 링크를 다시 열어 주세요.',
};

interface Props {
  readonly port: InvitePort;
  readonly holder: InviteCodeHolder;
}

/**
 * /reviewer/invite. The fragment was already removed from the URL in main.tsx; this page only
 * decides whether the held code can be redeemed now. A Google sign-in is a full-page redirect that
 * unloads the in-memory code, so after signing in the reviewer must reopen the original link.
 */
export function ReviewerInvite({port, holder}: Props) {
  const [step, setStep] = useState<Step>({kind: 'CHECKING'});
  const code = useRef<string | null>(null);

  useEffect(() => {
    if (code.current === null) code.current = holder.take();
    if (code.current === null) { setStep({kind: 'NO_CODE'}); return; }
    const abort = new AbortController();
    port.getSession(abort.signal).then(
      () => setStep({kind: 'READY'}),
      (e: unknown) => {
        if (abort.signal.aborted) return;
        if (e instanceof HufsApiError && e.code === 'UNAUTHENTICATED') {
          code.current = null; // leaving for Google discards it anyway; do not keep it around
          setStep({kind: 'NEED_SIGN_IN'});
        } else setStep({kind: 'FAILED', code: e instanceof HufsApiError ? e.code : 'PROVIDER_UNAVAILABLE'});
      },
    );
    return () => abort.abort();
  }, [port, holder]);

  const redeem = () => {
    const c = code.current;
    code.current = null; // one attempt per opened link
    if (!c) { setStep({kind: 'NO_CODE'}); return; }
    setStep({kind: 'REDEEMING'});
    port.redeemReviewerInvite(c).then(
      r => setStep({kind: 'DONE', endsAt: r.accessEndsAt}),
      (e: unknown) => setStep({kind: 'FAILED', code: e instanceof HufsApiError ? e.code : 'PROVIDER_UNAVAILABLE'}),
    );
  };

  const signIn = <a className="button" href={googleSignInPath('REVIEWER')}>Google로 로그인</a>;
  switch (step.kind) {
    case 'CHECKING':
      return <p role="status" aria-busy="true">초대 링크를 확인하는 중</p>;
    case 'NO_CODE':
      return (
        <div className="invite">
          <p>초대 코드가 없습니다. 받은 초대 링크를 처음부터 다시 열어 주세요.</p>
          <p className="muted">보안을 위해 초대 코드는 주소창이나 브라우저 저장소에 남기지 않습니다. Google 로그인 뒤에는 초대 링크를 한 번 더 열어야 합니다.</p>
          <p>아직 로그인하지 않았다면 먼저 로그인해 주세요.</p>
          {signIn}
        </div>
      );
    case 'NEED_SIGN_IN':
      return (
        <div className="invite" role="alert">
          <p>먼저 Google로 로그인해 주세요. 로그인 후 <strong>받은 초대 링크를 다시 열면</strong> 등록을 이어서 할 수 있습니다.</p>
          {signIn}
        </div>
      );
    case 'READY':
    case 'REDEEMING':
      return (
        <div className="invite">
          <p>심사용 <strong>합성 시연</strong>에 이 Google 계정을 등록합니다.</p>
          <ul className="muted">
            <li>가상 학생 S01~S05의 합성 자료만 볼 수 있습니다. 실제 학생 정보는 없습니다.</li>
            <li>저장·신청 등은 합성 시연 안에서만 기록되고 실제로 보내지지 않습니다.</li>
          </ul>
          <button type="button" className="button" onClick={redeem} disabled={step.kind === 'REDEEMING'} aria-busy={step.kind === 'REDEEMING'}>
            {step.kind === 'REDEEMING' ? '등록하는 중' : '초대 등록하기'}
          </button>
        </div>
      );
    case 'DONE':
      return (
        <div className="invite" role="status">
          <p><strong>등록되었습니다.</strong> 합성 시연 체험 기간: {accessEndText(step.endsAt)}</p>
          {/* Full page load: a fresh tab controller is created with the new REVIEWER session. */}
          <a className="button" href="/">시연 시작하기</a>
        </div>
      );
    case 'FAILED':
      return (
        <div className="invite" role="alert">
          <p>{FAILURE_TEXT[step.code] ?? DEFAULT_ERROR_MESSAGES[step.code]}</p>
          <p className="muted">같은 초대 코드는 이 화면에서 다시 보내지 않습니다. 초대 링크를 다시 열어 주세요.</p>
        </div>
      );
  }
}
